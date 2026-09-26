"""Scoped Office/Mac sync. Install beside engine.py; credentials remain on this Mac."""
import argparse,fcntl,hashlib,json,os,pathlib,sys,urllib.request,urllib.error
import datetime as dt
from decimal import Decimal

FIELDS={'name':'name','abn':'abn','invoiceNumber':'invoice_number','issueDate':'issue_date','workPeriod':'work_period','currency':'currency','recordType':'record_type','duplicateOf':'duplicate_of'}
def compare_source(d,cloud):
    if not cloud.get('sourceHash') or cloud['sourceHash']!=d.get('sha256'):raise ValueError('Source version requires a fresh Office snapshot and review')
    for remote,local in FIELDS.items():
        a=str(cloud.get(remote) or '').strip();b=str(d.get(local) or '').strip()
        if remote=='abn':a=''.join(a.split());b=''.join(b.split())
        if a!=b:raise ValueError('Invoice details changed on Mac; review the current version')
    if cloud.get('amountCents')!=d.get('amount_cents'):raise ValueError('Invoice amount changed on Mac; review the current version')

def apply_event(engine,event):
    import uuid
    event_id=str(uuid.UUID(event['id']));kind=event['kind'];reason=event['reason'];doc_id=event['document_id'];cloud=event['document']
    marker='Office event '+event_id
    state=engine.load();d=engine.document(state,doc_id)
    expected={k:d.get(k) for k in ['name','abn','amount_cents','invoice_number','issue_date','work_period','sha256','record_type','duplicate_of','currency']}
    # Payment IDs are the idempotency boundary even if a later invoice import changes metadata.
    prior=next((p for p in state['payments'] if p['id']==event_id),None)
    if kind=='payment' and prior:
        if (prior['document_id'],prior['amount_cents'],prior['date'])!=(doc_id,event['amount_cents'],event['payment_date']):raise ValueError('Payment ID conflicts with Mac history')
    elif kind=='void':
        target=next((p for p in state['payments'] if p['id']==event['target_id']),None)
        if not target or target['document_id']!=doc_id:raise ValueError('Original Office payment has not reached Mac yet')
        if not target.get('voided'):engine.void_payment(event['target_id'],reason+' ['+marker+']')
    elif kind=='approve':
        already=any(a.get('action')=='confirm_invoice' and a.get('document_id')==doc_id and a.get('reason','').endswith('['+marker+']') for a in state['audit'])
        if not already:
            compare_source(d,cloud)
            fields={'name':cloud['name'],'abn':cloud['abn'],'amount':str(Decimal(cloud['amountCents'])/100),'issue_date':cloud['issueDate'],'invoice_number':cloud['invoiceNumber'],'work_period':cloud['workPeriod']}
            engine.approve(doc_id,fields,reason+' ['+marker+']',expected=expected)
    elif kind=='payment':
        compare_source(d,cloud)
        engine.record_payment(doc_id,str(Decimal(event['amount_cents'])/100),event['payment_date'],reason+' ['+marker+']',event_id,expected=expected)
    else:raise ValueError('Unsupported Office action')
    state=engine.load();d=engine.document(state,doc_id)
    original=engine.inside(d['file'])
    if hashlib.sha256(original.read_bytes()).hexdigest()!=d['sha256']:raise ValueError('Original file checksum mismatch')
    status=engine.payment_status(state,d)
    if status=='Paid':
        target=engine.inside(d['folder'])/'Paid'/original.name
        if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest()!=d['sha256']:raise ValueError('Paid file copy not verified')
        file_state='paid_verified'
    else:file_state='reversed' if kind=='void' else 'partial' if status=='Part-paid' else 'reviewed'
    return {'event_id':event_id,'status':'applied','file_state':file_state,'message':'Mac register and source file verified'}

def exchange(config,request):
    url=config['url']
    if url!='https://wafebkzjotnyfqeloieo.supabase.co':raise ValueError('Unexpected Office server')
    data=json.dumps({'p_token':config['token'],'p_request':request},ensure_ascii=False,allow_nan=False).encode()
    req=urllib.request.Request(url+'/rest/v1/rpc/office_mac_exchange',data=data,headers={'Content-Type':'application/json','apikey':config['anon_key'],'Authorization':'Bearer '+config['anon_key']})
    with urllib.request.urlopen(req,timeout=30) as response:return json.load(response)

def sync(root,config_path):
    sys.path.insert(0,str(root));import engine
    from office_snapshot import export_snapshot
    config=json.loads(config_path.read_text())
    with (root/'data/office-sync.lock').open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return {'status':'already_running'}
        response=exchange(config,{'action':'pull'});receipts=[]
        for event in response['events']:
            try:receipt=apply_event(engine,event)
            except Exception as exc:
                # Local exceptions can contain private paths. Keep those off cloud and logs.
                safe=str(exc) if isinstance(exc,ValueError) and not any(x in str(exc) for x in ['/Users/','/private/','/var/']) else 'Mac processing could not complete; review locally'
                receipt={'event_id':event['id'],'status':'blocked','file_state':'blocked','message':safe[:300]}
            receipts.append(receipt)
        snapshot=json.loads(export_snapshot(root).read_text())
        exchange(config,{'action':'commit','snapshot':snapshot,'receipts':receipts})
        result={'status':'ok','finished_at':dt.datetime.now(dt.timezone.utc).isoformat(),'documents':len(snapshot['documents']),'applied':sum(r['status']=='applied' for r in receipts),'blocked':sum(r['status']=='blocked' for r in receipts)}
        target=root/'Reports/office_sync_status.json';temp=target.with_suffix('.tmp');temp.write_text(json.dumps(result));os.chmod(temp,0o600);os.replace(temp,target)
        return result

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parent);parser.add_argument('--config',type=pathlib.Path,default=pathlib.Path.home()/'Library/Application Support/Still Partners/office-device.json');args=parser.parse_args()
    try:print(json.dumps(sync(args.root,args.config)))
    except Exception as exc:
        print(json.dumps({'status':'error','error_type':type(exc).__name__,'message':'Office sync unavailable. No success receipt sent; retry is safe.'}));sys.exit(1)
