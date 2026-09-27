"""Read-only, allowlisted Office metadata export. Never exports PDFs or credentials."""
import argparse, datetime as dt, hashlib, json, os
from pathlib import Path
from urllib.parse import urlparse

def text(v): return ('' if v is None else str(v))[:2000]
def cents(v):
    return v if isinstance(v,int) and not isinstance(v,bool) and abs(v)<10**12 else None

def build_snapshot(raw):
    state=json.loads(raw)
    if state.get('account')!='work@stillpartners.net': raise ValueError('Unexpected source account')
    payments=[p for p in state.get('payments',[]) if not p.get('voided')]
    documents=[]
    for d in state['documents']:
        allocated=[p for p in payments if p.get('document_id')==d['id']]
        paid=sum(cents(p.get('amount_cents')) or 0 for p in allocated)
        amount=cents(d.get('amount_cents'))
        source=text(d.get('source'));u=urlparse(source)
        source=source if u.scheme=='https' and u.hostname=='mail.google.com' else ''
        issues=[text(x) for x in d.get('flags',[])]
        if not d.get('supplier_id'):issues.append('Supplier identity not confirmed')
        documents.append(dict(id=text(d['id']),sourceHash=text(d.get('sha256')),supplierId=text(d.get('supplier_id')),name=text(d.get('name')),abn=text(d.get('abn')),email=text(d.get('email')),phone=text(d.get('phone')),invoiceNumber=text(d.get('invoice_number')),issueDate=text(d.get('issue_date')),workPeriod=text(d.get('work_period')),received=text(d.get('received')),amountCents=amount,gst=text(d.get('gst')) if d.get('gst') is not None else '',currency=text(d.get('currency')),tonnage=text(d.get('tonnage')),recordType=text(d.get('record_type')),approved=d.get('approved') is True,duplicateOf=text(d.get('duplicate_of')),flags=issues,source=source,filename=Path(text(d.get('filename'))).name,paidCents=paid,paymentStatus='Paid' if paid and amount and paid>=amount else 'Part-paid' if paid else 'Unknown',payments=[dict(id=text(p.get('id')),date=text(p.get('date')),amountCents=cents(p.get('amount_cents'))) for p in allocated]))
    for source, exported in zip(state['documents'], documents):
        from office_history import valid_closure
        h=valid_closure(source)
        if h: exported['historicalClosure']={k:h.get(k) for k in ['kind','cutoff','confirmed_at','basis','basis_date','source_hash','file_verified_at']}
    if len({d['id'] for d in documents})!=len(documents):raise ValueError('Duplicate source document IDs')
    return dict(version=1,account=state['account'],sourceDigest=hashlib.sha256(b'office-snapshot-v1.1\0'+raw).hexdigest(),exportedAt=dt.datetime.now(dt.timezone.utc).isoformat(),paymentsComplete=state.get('payments_complete') is True,documents=documents)

def export_snapshot(root):
    root=Path(root);payload=build_snapshot((root/'data/register.json').read_bytes())
    target=root/'Reports/Office_snapshot.json';target.parent.mkdir(exist_ok=True)
    temporary=target.with_suffix('.tmp');temporary.write_text(json.dumps(payload,ensure_ascii=False,allow_nan=False));os.chmod(temporary,0o600);os.replace(temporary,target)
    return target
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('root',type=Path);args=parser.parse_args();print(export_snapshot(args.root))
