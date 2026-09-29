"""Refresh Bobby's authorised company evidence using the existing device export.

Only the selected company fields enter model context. Credentials, bank details,
other conversation transcripts and export history never enter that context.
No database write, payment, approval or outgoing message is performed here.
"""
import datetime as dt, json, pathlib

TABLES=('workers','clients','jobs','work_entries','office_rates','office_work_adjustments',
        'office_contractor_settings','office_contractor_names','office_company_records',
        'office_documents','office_contact_imports','office_invoice_events')

def from_export(export,previous,now=None):
 tables=export.get('tables',{})
 if not isinstance(tables,dict) or any(not isinstance(tables.get(k),list) for k in TABLES):
  raise ValueError('Company refresh is incomplete; keep previous evidence labelled stale')
 captured=export.get('exported_at')
 if not isinstance(captured,str):raise ValueError('Company refresh date unavailable')
 stamp=dt.datetime.fromisoformat(captured.replace('Z','+00:00'))
 if stamp.tzinfo is None:raise ValueError('Company refresh timezone unavailable')
 now=now or dt.datetime.now(dt.timezone(dt.timedelta(hours=8)))
 if abs((now-stamp).total_seconds())>300:raise ValueError('Company refresh is stale')
 today=now.astimezone(dt.timezone(dt.timedelta(hours=8))).date()
 start=(today-dt.timedelta(days=89)).isoformat();end=today.isoformat()
 groups={r['worker_id']:r.get('engagement_group') for r in tables['office_contractor_settings']}
 names={r['worker_id']:r for r in tables['office_contractor_names']}
 adjustments={r['work_entry_id']:r for r in tables['office_work_adjustments']}
 records=tables['office_company_records'];context=dict(previous)
 context.update(capturedAt=captured,today=end,currency='AUD',workRange={'from':start,'to':end},
  contractors=[{'id':w['id'],'fullName':w['full_name'],'shortName':names.get(w['id'],{}).get('short_name',''),
   'aliases':names.get(w['id'],{}).get('aliases',[]),'nameVersion':names.get(w['id'],{}).get('version',0),
   'email':w.get('email') or '', 'phone':w.get('phone') or '', 'abn':w.get('abn') or '',
   'group':'occasional' if groups.get(w['id'])=='occasional' else 'regular',
   'active':w.get('is_active') is not False and w.get('account_enabled') is not False} for w in tables['workers']],
  clients=[{'id':c['id'],'name':c['name'],'active':c.get('is_active') is not False,
   'email':c.get('billing_email') or c.get('email') or '', 'abn':c.get('abn') or '',
   'contactName':c.get('contact_name') or '', 'paymentTermsDays':c.get('payment_terms_days')} for c in tables['clients']],
  sites=[{'id':j['id'],'clientId':j['client_id'],'name':j.get('site_name') or j.get('title') or 'Location',
   'active':j.get('project_status')=='active'} for j in tables['jobs']],
  agreedRates=[{'id':r['id'],'workerId':r['worker_id'],'clientId':r.get('client_id'),'kind':r['kind'],
   'hourlyRateCents':r['hourly_rate_cents'],'effectiveFrom':r['effective_from'],
   'agreementNote':r.get('agreement_note') or '', 'voidedAt':r.get('voided_at')} for r in tables['office_rates']],
  companyMemory=[r for r in records if r['kind']=='memory'],workItems=[r for r in records if r['kind']=='work'],
  documents=tables['office_documents'],paymentEvents=tables['office_invoice_events'])
 context['workRecords']=[]
 for e in tables['work_entries']:
  if not start<=e['work_date']<=end:continue
  a=adjustments.get(e['id'],{});hours=e['hours']
  context['workRecords'].append({'id':e['id'],'workerId':e['worker_id'],'jobId':e['job_id'],
   'workDate':e['work_date'],'actualHours':hours,'contractorHours':a.get('contractor_hours',hours),
   'clientHours':a.get('client_hours',hours),'agreementNote':a.get('agreement_note') or '',
   'locked':bool(e.get('locked') or e.get('approved')),'updatedAt':e.get('updated_at') or ''})
 context['contactReviews']=[{'id':r['id'],'status':r['status'],'workerId':r.get('worker_id'),
  **{k:r.get('source_data',{}).get(k,[] if k in ('emails','phones','issues') else '') for k in ('name','abn','emails','phones','issues','documentCount')}} for r in tables['office_contact_imports']]
 context['pendingContactReviews']=sum(r['status']=='pending' for r in context['contactReviews'])
 context['freshness']={'status':'current','checkedAt':captured,'note':'Current saved company records; attendance completeness and bank settlement are not independently verified.'}
 return context

def refresh(previous,config_path=None):
 from office_mac_sync import exchange
 path=pathlib.Path(config_path or pathlib.Path.home()/'Library/Application Support/Still Partners/office-device.json')
 config=json.loads(path.read_text())
 return from_export(exchange(config,{'action':'backup'},attempts=1),previous)
