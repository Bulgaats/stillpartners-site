'use client';
import {useEffect,useState,useTransition,useRef,useCallback} from 'react';
import {listCompanyRecords,saveCompanyRecord,companyRecordHistory,checkCompanyWork} from '@/app/actions/company-records';
import {recordDraft,reviewedWorkDraft,companyRecordProposal,type CompanyRecord,type CompanyRecordProposal,type MonitorStatus} from '@/lib/office/company-records';
const label=(s:string)=>s.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
export function CompanyRecords({kind,today,navigate}:{kind:'memory'|'work';today:string;navigate?:(s:string)=>void}){
 const [rows,setRows]=useState<CompanyRecord[]>([]),[draft,setDraft]=useState<CompanyRecordProposal|null>(null),[message,setMessage]=useState(''),[filter,setFilter]=useState('active'),[search,setSearch]=useState(''),[loading,setLoading]=useState(true),[pending,start]=useTransition();
 const event=useRef({key:'',id:''}),form=useRef<HTMLFormElement>(null),saving=useRef(false);
 const [savingId,setSavingId]=useState<string|null>(null),[refreshing,setRefreshing]=useState(false);
 const [monitor,setMonitor]=useState<MonitorStatus|null>(null),[checking,setChecking]=useState(false);
 const refresh=useCallback(async()=>{try{setRows(await listCompanyRecords());}catch{setMessage('Could not load company records. Try Refresh.');}finally{setLoading(false);}},[]);
 const check=useCallback(async(enabled?:boolean)=>{setChecking(true);try{setMonitor(await checkCompanyWork(enabled));await refresh();}catch{setMessage('Automatic checks could not finish. Your saved work remains available.');await refresh();}finally{setChecking(false);}},[refresh]);
 useEffect(()=>{if(kind==='work')void check();else void refresh();},[kind,check,refresh]);
 function edit(r?:CompanyRecord){setDraft(recordDraft(kind,r));setMessage('');requestAnimationFrame(()=>{form.current?.scrollIntoView({block:'start'});form.current?.focus({preventScroll:true});});}
 function change(p:Partial<CompanyRecordProposal>){setDraft(d=>d?{...d,...p}:d);}
 async function manualRefresh(){setRefreshing(true);setMessage('Refreshing records…');try{setRows(await listCompanyRecords());setMessage('Records are up to date.');}catch{setMessage('Could not refresh records. Try again.');}finally{setRefreshing(false);}}
 const visible=rows.filter(r=>r.kind===kind&&(filter==='all'||!['completed','cancelled','superseded'].includes(r.status))&&[r.title,r.body,r.next_action].join(' ').toLowerCase().includes(search.toLowerCase())).sort((a,b)=>kind==='work'?(a.due_date??'9999').localeCompare(b.due_date??'9999')||b.updated_at.localeCompare(a.updated_at):b.updated_at.localeCompare(a.updated_at));
 const open=rows.filter(r=>r.kind==='work'&&!['completed','cancelled'].includes(r.status));
 function save(payload:CompanyRecordProposal|null=draft,success?:string){
  if(!payload||saving.current)return;
  const parsed=companyRecordProposal.safeParse(payload);
  if(!parsed.success){setMessage(parsed.error.issues[0]?.message??'Check the record details.');return;}
  const key=JSON.stringify(payload);
  if(event.current.key!==key)event.current={key,id:crypto.randomUUID()};
  const id=event.current.id;saving.current=true;setSavingId(payload.id);setMessage('Saving…');
  start(async()=>{try{
   const result=await saveCompanyRecord(id,payload);setMessage(result.ok&&success?success:result.message);
   if(result.ok){setDraft(null);event.current={key:'',id:''};
    // Keep the acknowledged result visible even if the following read fails.
    setRows(old=>old.map(r=>r.id===payload.id?{...r,title:payload.title,body:payload.body,status:payload.status,next_action:payload.nextAction,outcome:payload.outcome,version:payload.expectedVersion+1}:r));
    await refresh();
   }
  }catch{setMessage('Could not confirm the save. Retry the same action without editing.');}
  finally{saving.current=false;setSavingId(null);}});
 }
 function decide(payload:CompanyRecordProposal,status:'completed'|'cancelled'){
  save(reviewedWorkDraft(payload,status),status==='completed'?'Approved & closed. Saved in history.':'Dismissed. Saved in history; use Review / edit there to reopen.');
 }
 return <section className="ember-panel">
 <div className="ember-section-heading"><div><p className="eyebrow">{kind==='work'?'COMPANY WORK':'SHARED ACROSS CHATS'}</p><h2>{kind==='work'?'Work inbox':'Company memory'}</h2></div><button className="office-record-add" disabled={pending} onClick={()=>edit()}>+ {kind==='work'?'New work item':'Add memory'}</button></div>
 <p className="muted">{kind==='work'?'Work Bobby has found, with a next step and supporting records.':'Confirmed decisions, agreements and preferences stay available in new chats. Recording a rule here does not activate an automatic action.'}</p>
 {kind==='work'&&<div className="office-monitor-status"><p><strong>{monitor?(monitor.enabled?'Automatic checks on':'Automatic checks paused'):'Loading check status…'}</strong>{monitor?.last_checked_at&&<> · Last checked {new Date(monitor.last_checked_at).toLocaleString('en-AU',{timeZone:'Australia/Perth'})}</>}</p>{monitor?.last_error&&<p role="status" className="ember-notice">The last background check could not finish. Saved work items are retained.</p>}<div className="ember-chips"><button disabled={checking} onClick={()=>void check()}>{checking?'Checking…':'Check now'}</button>{monitor&&<button disabled={checking} onClick={()=>void check(!monitor.enabled)}>{monitor.enabled?'Pause checks':'Resume checks'}</button>}</div><details><summary>About these checks</summary><p className="ember-footnote">Bobby checks saved invoice warnings, missing agreed rates for new work, Mac filing and invoice-email delivery. Repeated checks update the same work item. This is not a live Gmail search or a full time/rate reconciliation. Checks run with Mac sync and when this inbox opens. Pausing checks does not pause Bobby chat, sync or already-approved email delivery.</p></details></div>}
 {kind==='work'&&<div className="office-work-counts"><span>{open.length} open</span><span>{open.filter(r=>r.due_date&&r.due_date<today).length} past review date</span><span>{open.filter(r=>r.status.startsWith('waiting')).length} waiting</span></div>}
 <div className="ember-chips"><button aria-pressed={filter==='active'} onClick={()=>{setFilter('active');setMessage('Showing active records.');}}>Active</button><button aria-pressed={filter==='all'} onClick={()=>{setFilter('all');setMessage('Showing all records, including history.');}}>Including history</button><button disabled={refreshing||pending} onClick={()=>void manualRefresh()}>{refreshing?'Refreshing…':'Refresh'}</button></div>
 <input aria-label="Search company records" placeholder={kind==='work'?'Search work items…':'Search decisions and agreements…'} value={search} onChange={e=>setSearch(e.target.value)}/>
 {message&&<div className="office-action-feedback"><p role="status">{message}</p><button type="button" aria-label="Dismiss status message" onClick={()=>setMessage('')}>×</button></div>}
 {draft&&<form ref={form} tabIndex={-1} aria-label="Review company record" className="office-record-form" aria-busy={pending} onSubmit={e=>{e.preventDefault();save();}}>
  <h3>{draft.id?'Update':'New'} {kind==='work'?'work item':'memory'}</h3>
  {kind==='work'&&draft.id&&!['completed','cancelled'].includes(draft.status)&&<><p className="ember-footnote">Choose Approve & close to accept this item, or Dismiss if it is not needed. No comment is required. These choices close the inbox item only; its source and payment records stay unchanged.</p><div className="office-record-actions"><button type="button" className="ember-primary" disabled={pending} onClick={()=>decide(draft,'completed')}>{pending?'Saving…':'Approve & close'}</button><button type="button" className="office-danger" disabled={pending} onClick={()=>decide(draft,'cancelled')}>Dismiss</button></div></>}
  <label>Title<input required minLength={2} maxLength={160} value={draft.title} disabled={pending} onChange={e=>change({title:e.target.value})}/></label>
  <label>{kind==='work'?'Details':'Confirmed details'}<textarea rows={3} required={kind==='memory'} maxLength={4000} value={draft.body} disabled={pending} onChange={e=>change({body:e.target.value})}/></label>
  <div className="office-record-fields"><label>Status<select value={draft.status} disabled={pending} onChange={e=>change({status:e.target.value as CompanyRecordProposal['status']})}>{(kind==='memory'?['confirmed','superseded']:['open','waiting_external','waiting_mac','needs_review',...(draft.id?['completed','cancelled']:[])]).map(s=><option key={s} value={s}>{label(s)}</option>)}</select></label>
  {kind==='memory'?<><label>Category<select value={draft.category} disabled={pending} onChange={e=>change({category:e.target.value as CompanyRecordProposal['category']})}>{['decision','agreement','preference','rule'].map(s=><option key={s} value={s}>{label(s)}</option>)}</select></label><label>Effective from<input type="date" value={draft.effectiveDate} disabled={pending} onChange={e=>change({effectiveDate:e.target.value})}/></label></>:<><label>Priority<select value={draft.priority} disabled={pending} onChange={e=>change({priority:e.target.value as CompanyRecordProposal['priority']})}>{['low','normal','high','urgent'].map(s=><option key={s} value={s}>{label(s)}</option>)}</select></label><label>Next review / due date<input type="date" value={draft.dueDate} disabled={pending} onChange={e=>change({dueDate:e.target.value})}/></label></>}</div>
  {kind==='work'&&<><label>Next action / waiting reason<textarea maxLength={1000} rows={2} value={draft.nextAction} disabled={pending} onChange={e=>change({nextAction:e.target.value})}/></label><label>Outcome and evidence{['completed','cancelled'].includes(draft.status)?' (required)':''}<textarea rows={2} maxLength={2000} value={draft.outcome} disabled={pending} onChange={e=>change({outcome:e.target.value})}/></label></>}
  <label>Source / supporting reference<input maxLength={500} value={draft.sourceRef} disabled={pending} placeholder="Owner decision, invoice ID, email thread or document reference" onChange={e=>change({sourceRef:e.target.value})}/></label>
  <p className="ember-footnote">{kind==='memory'?'Save confirms this company memory. Agreed hourly rates must still be maintained in Agreed rates; a saved rule does not grant sending or payment authority.':'Save records the work status only. It does not send a message, transfer money or mark an invoice paid.'}</p>
  <button className="ember-primary" disabled={pending} type="submit">{pending?'Saving…':kind==='memory'?'Confirm & save memory':'Save changes'}</button><button className="ember-text-button" disabled={pending} type="button" onClick={()=>setDraft(null)}>Cancel</button>
 </form>}
 {loading?<p className="muted">Loading…</p>:visible.length===0?<p className="ember-empty">No matching {kind==='work'?'work items':'company memories'}.</p>:visible.map(r=><article key={r.id} className="office-record-card" data-status={r.status} aria-busy={pending&&savingId===r.id}>
  <div className="ember-section-heading"><h3>{r.title}</h3><span className="office-record-badge">{label(r.status)}</span></div>
  <p style={{whiteSpace:'pre-wrap'}}>{r.body}</p>
  {kind==='work'?<><p><strong>Next:</strong> {r.next_action||'—'}</p><small>{label(r.priority)} priority{r.due_date?` · Review / due ${r.due_date}`:''}{r.due_date&&r.due_date<today&&!['completed','cancelled'].includes(r.status)?' · Review date passed':''}</small>{r.outcome&&<p><strong>Outcome:</strong> {r.outcome}</p>}</>:<small>{label(r.category)}{r.effective_date?` · Effective ${r.effective_date}`:''}{r.effective_date&&r.effective_date>today?' · Future agreement':''}</small>}
  {r.source_ref&&<p className="ember-footnote">Source: {r.source_ref}</p>}
  {r.detection&&<><p className="ember-footnote">Bobby detected · {label(r.detection.rule)} · {r.detection.active?'Condition still present':'Condition cleared'} · {new Date(r.detection.observedAt).toLocaleString('en-AU',{timeZone:'Australia/Perth'})}</p>{r.body!==r.detection.summary&&<details><summary>Latest detected evidence</summary><p style={{whiteSpace:'pre-wrap'}}>{r.detection.summary}</p></details>}{navigate&&<button className="ember-text-button" onClick={()=>navigate(r.detection!.rule==='work_rates'?'rates':r.detection!.rule==='mail_delivery'?'invoices':'contractor-invoices')}>Open related section →</button>}</>}
  <div className="office-record-actions"><button className="office-secondary" disabled={pending} onClick={()=>edit(r)}>Review / edit</button>{kind==='work'&&!['completed','cancelled'].includes(r.status)&&<><button className="ember-primary" disabled={pending} onClick={()=>decide(recordDraft(kind,r),'completed')}>{pending&&savingId===r.id?'Saving…':'Approve & close'}</button><button className="office-danger" disabled={pending} onClick={()=>decide(recordDraft(kind,r),'cancelled')}>Dismiss</button></>}</div>
  {kind==='work'&&!['completed','cancelled'].includes(r.status)&&<p className="ember-footnote">Approve or dismiss this inbox item. No comment required; history is kept.</p>}
  <RecordHistory id={r.id} version={r.version}/>
 </article>)}
 </section>;
}
function RecordHistory({id,version}:{id:string;version:number}){
 const [history,setHistory]=useState<Awaited<ReturnType<typeof companyRecordHistory>>|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 return <details className="office-record-history" onToggle={e=>{if(e.currentTarget.open){setLoading(true);setError('');void companyRecordHistory(id).then(setHistory).catch(()=>setError('History could not be loaded. Close and reopen to retry.')).finally(()=>setLoading(false));}}}><summary>Version {version} · Change history</summary>{loading&&<p role="status">Loading history…</p>}{!loading&&history?.length===0&&!error&&<p>No changes recorded.</p>}{error&&<p>{error}</p>}{history?.map(h=><div key={h.id}><strong>Version {h.after_data.version} · {label(h.after_data.status)}</strong><small>{new Date(h.created_at).toLocaleString('en-AU',{timeZone:'Australia/Perth'})}</small><p>{h.after_data.title}</p><p style={{whiteSpace:'pre-wrap'}}>{h.after_data.body}</p>{h.after_data.outcome&&<p>Outcome: {h.after_data.outcome}</p>}</div>)}{history?.length===50&&<p>Showing the latest 50 changes. Earlier versions are retained.</p>}</details>;
}
