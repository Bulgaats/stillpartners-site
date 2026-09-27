"""Owner-authorised historical closure, separate from dated cash payments.
Originals and real payments are never changed. Missing work dates are not invented.
"""
import datetime as dt
import hashlib
import json
import pathlib
import re
import shutil


def period(value):
    text=str(value or '').strip()
    iso=re.fullmatch(r'(\d{4}-\d{2}-\d{2})(?:\s*(?:to|[-–—])\s*(\d{4}-\d{2}-\d{2}))?',text,re.I)
    au=re.fullmatch(r'(\d{1,2})/(\d{1,2})/(\d{4})(?:\s*(?:to|[-–—])\s*(\d{1,2})/(\d{1,2})/(\d{4}))?',text,re.I)
    try:
        if iso:a=dt.date.fromisoformat(iso[1]);b=dt.date.fromisoformat(iso[2]) if iso[2] else a
        elif au:a=dt.date(int(au[3]),int(au[2]),int(au[1]));b=dt.date(int(au[6]),int(au[5]),int(au[4])) if au[4] else a
        else:return None
        return (a.isoformat(),b.isoformat()) if a<=b else None
    except ValueError:return None


def eligibility(d,policy):
    cutoff=policy['cutoff']
    p=period(d.get('work_period'))
    if p:return {'basis':'work_period','date':p[1]} if p[1]<=cutoff else None
    # A nonempty but invalid period must not be silently overridden by an old issue date.
    if str(d.get('work_period') or '').strip():return None
    try:
        received=dt.datetime.fromisoformat(str(d.get('received') or '').replace('Z','+00:00'))
        if received.tzinfo is None:received=received.replace(tzinfo=dt.timezone(dt.timedelta(hours=8)))
        day=received.astimezone(dt.timezone(dt.timedelta(hours=8))).date().isoformat()
    except ValueError:
        # Explicit, hash-bound legacy references selected once during cutover.
        # This never guesses a work period or promotes an unreadable source to paid.
        legacy=policy.get('legacy_references',{}).get(d.get('id'))
        return {'basis':'legacy_reference','date':'','reference_only':True} if legacy and legacy==d.get('sha256') else None
    # Received-before-cutoff is an archive basis only, never an inferred work/payment date.
    return {'basis':'received_before_cutoff','date':day} if day<=cutoff else None


def valid_closure(d):
    h=d.get('historical_closure') or {}
    return h if not h.get('reopened_at') and h.get('source_hash')==d.get('sha256') and h.get('kind') in ('settled','reference') else None


def apply_history(engine,policy,now=None):
    if policy.get('enabled') is not True:return {'closed':0,'file_errors':0}
    dt.date.fromisoformat(policy['cutoff'])
    if not policy.get('owner_confirmation') or not policy.get('confirmed_at'):raise ValueError('Owner confirmation required')
    stamp=now or dt.datetime.now(dt.timezone.utc).isoformat()
    initial=engine.load()
    candidates=[d for d in initial['documents'] if (valid_closure(d) or eligibility(d,policy)) and not (d.get('historical_closure') or {}).get('reopened_at')]
    # Do not create a register backup every five minutes when there is no work.
    pending=[d for d in candidates if not valid_closure(d) or not engine.inside(valid_closure(d).get('archive_file','')).is_file()]
    if not pending:return {'closed':0,'file_errors':0}
    closed=0;errors=[]
    with engine.transaction() as state:
        for candidate in pending:
            d=engine.document(state,candidate['id'])
            if (d.get('historical_closure') or {}).get('reopened_at'):continue
            h=valid_closure(d);basis=eligibility(d,policy)
            if not h and not basis:continue
            kind=h['kind'] if h else 'settled' if not basis.get('reference_only') and d.get('record_type')=='invoice' and not d.get('duplicate_of') and (d.get('amount_cents') or 0)>0 else 'reference'
            source=engine.inside(d['file'])
            try:
                if hashlib.sha256(source.read_bytes()).hexdigest()!=d['sha256']:raise ValueError('Source checksum mismatch')
                folder=pathlib.Path('Contractors')/(engine.safe(d.get('name'))+'__'+engine.safe(d.get('abn') or 'ABN_UNCONFIRMED'))
                dest=engine.inside(str(folder/('Paid/Historical' if kind=='settled' else 'Historical_References')/policy['cutoff']/(engine.safe(d['id'])+'__'+source.name)))
                dest.parent.mkdir(parents=True,exist_ok=True)
                if dest.exists() and hashlib.sha256(dest.read_bytes()).hexdigest()!=d['sha256']:raise ValueError('Historical copy conflict')
                if not dest.exists():shutil.copy2(source,dest)
                if hashlib.sha256(dest.read_bytes()).hexdigest()!=d['sha256']:raise ValueError('Historical copy not verified')
                relative=str(dest.relative_to(engine.ROOT.resolve()))
                if not h:
                    h={'kind':kind,'cutoff':policy['cutoff'],'confirmed_at':policy['confirmed_at'],'recorded_at':stamp,'confirmation':policy['owner_confirmation'],'source_hash':d['sha256'],'basis':basis['basis'],'basis_date':basis['date'],'payment_date':None,'payment_amount_cents':None}
                    engine.audit(state,'historical_closure',document_id=d['id'],closure=h.copy())
                    closed+=1
                h['archive_file']=relative;h['file_verified_at']=stamp;d['historical_closure']=h
            except (OSError,ValueError) as exc:errors.append({'document_id':d['id'],'error':type(exc).__name__})
    return {'closed':closed,'file_errors':len(errors),'errors':errors}


def reopen(engine,doc_id,reason):
    if len(reason.strip())<3:raise ValueError('Reopening reason required')
    with engine.transaction() as state:
        d=engine.document(state,doc_id);h=valid_closure(d)
        if not h:return
        h['reopened_at']=dt.datetime.now(dt.timezone.utc).isoformat();h['reopen_reason']=reason
        engine.audit(state,'reopen_historical_invoice',document_id=doc_id,reason=reason)
