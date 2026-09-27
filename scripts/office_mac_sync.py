"""Scoped Office/Mac sync. Install beside engine.py; credentials remain on this Mac."""
import argparse,fcntl,hashlib,json,os,pathlib,sys,urllib.request,urllib.error,time,socket,ssl
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

def exchange(config,request,attempts=3):
    url=config['url']
    if url!='https://wafebkzjotnyfqeloieo.supabase.co':raise ValueError('Unexpected Office server')
    data=json.dumps({'p_token':config['token'],'p_request':request},ensure_ascii=False,allow_nan=False).encode()
    for attempt in range(attempts):
        req=urllib.request.Request(url+'/rest/v1/rpc/office_mac_exchange',data=data,headers={'Content-Type':'application/json','apikey':config['anon_key'],'Authorization':'Bearer '+config['anon_key']})
        try:
            with urllib.request.urlopen(req,timeout=30) as response:return json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code not in (408,429,500,502,503,504) or attempt+1==attempts:raise
        except (urllib.error.URLError,TimeoutError,ConnectionError):
            if attempt+1==attempts:raise
        time.sleep((1,3)[min(attempt,1)])


def write_status(root,result):
    target=root/'Reports/office_sync_status.json';target.parent.mkdir(exist_ok=True)
    try:prior=json.loads(target.read_text())
    except (OSError,ValueError):prior={}
    result['last_success_at']=result.get('finished_at') if result['status']=='ok' else prior.get('last_success_at') or (prior.get('finished_at') if prior.get('status')=='ok' else None)
    temp=target.with_suffix('.tmp');temp.write_text(json.dumps(result));os.chmod(temp,0o600);os.replace(temp,target)
    return result


def safe_error(exc):
    cause=getattr(exc,'reason',exc)
    if isinstance(exc,urllib.error.HTTPError):return 'HTTP_'+str(exc.code)
    if isinstance(cause,ssl.SSLError):return 'TLS_ERROR'
    if isinstance(cause,socket.gaierror):return 'DNS_ERROR'
    if isinstance(cause,(TimeoutError,socket.timeout)):return 'NETWORK_TIMEOUT'
    return type(exc).__name__


def publish_health(config,result):
    try:exchange(config,{'action':'health','health':result},attempts=1)
    except (OSError,ValueError):pass # Local failure state remains durable if server is unreachable.

def sync(root,config_path):
    sys.path.insert(0,str(root));import engine
    from office_snapshot import export_snapshot
    config=json.loads(config_path.read_text())
    with (root/'data/office-sync.lock').open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return {'status':'already_running'}
        return sync_locked(root,config,engine,export_snapshot)

def sync_locked(root,config,engine,export_snapshot):
    stage='pull';started=dt.datetime.now(dt.timezone.utc).isoformat()
    try:
        response=exchange(config,{'action':'pull'});receipts=[]
        for event in response['events']:
            try:receipt=apply_event(engine,event)
            except Exception as exc:
                # Local exceptions can contain private paths. Keep those off cloud and logs.
                safe=str(exc) if isinstance(exc,ValueError) and not any(x in str(exc) for x in ['/Users/','/private/','/var/']) else 'Mac processing could not complete; review locally'
                receipt={'event_id':event['id'],'status':'blocked','file_state':'blocked','message':safe[:300]}
            receipts.append(receipt)
        stage='archive'
        from office_history import apply_history
        policy_path=root/'data/office_history_policy.json'
        archived=apply_history(engine,json.loads(policy_path.read_text())) if policy_path.exists() else {'closed':0,'file_errors':0}
        stage='commit'
        snapshot=json.loads(export_snapshot(root).read_text())
        exchange(config,{'action':'commit','snapshot':snapshot,'receipts':receipts})
        result={'status':'ok','finished_at':dt.datetime.now(dt.timezone.utc).isoformat(),'documents':len(snapshot['documents']),'applied':sum(r['status']=='applied' for r in receipts),'blocked':sum(r['status']=='blocked' for r in receipts),'archive_errors':archived['file_errors'],'last_attempt_at':started,'stage':'complete'}
        stage='backup'
        backup_policy=root/'data/office_backup_policy.json'
        if backup_policy.exists():
            from office_backup import daily_backup
            try:
                cloud=exchange(config,{'action':'backup'});cloud_path=root/'data/office_cloud_backup.json';cloud_temp=cloud_path.with_suffix('.tmp');cloud_temp.write_text(json.dumps(cloud));os.chmod(cloud_temp,0o600);os.replace(cloud_temp,cloud_path)
                backup=daily_backup(root,json.loads(backup_policy.read_text()));result['backup_at']=backup['created_at'];result['backup_off_device']=backup['off_device']
            except (OSError,ValueError):result['backup_error']=True
        result=write_status(root,result);publish_health(config,result)
        return result
    except Exception as exc:
        result=write_status(root,{'status':'error','last_attempt_at':started,'stage':stage,'error_type':safe_error(exc),'message':'Synchronization could not finish. Retrying is safe; original files and payment records are preserved.'})
        publish_health(config,result)
        raise

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parent);parser.add_argument('--config',type=pathlib.Path,default=pathlib.Path.home()/'Library/Application Support/Still Partners/office-device.json');args=parser.parse_args()
    try:print(json.dumps(sync(args.root,args.config)))
    except Exception as exc:
        print(json.dumps({'status':'error','error_type':type(exc).__name__,'message':'Office sync unavailable. No success receipt sent; retry is safe.'}));sys.exit(1)
