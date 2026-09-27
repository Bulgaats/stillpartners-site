'use client';
import {useEffect,useState,useTransition,useRef} from 'react';
import {listCompanyRecords,saveCompanyRecord,companyRecordHistory} from '@/app/actions/company-records';
import {recordDraft,type CompanyRecord,type CompanyRecordProposal} from '@/lib/office/company-records';
const label=(s:string)=>s.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
export function CompanyRecords({kind,today}:{kind:'memory'|'work';today:string}){
 const [rows,setRows]=useState<CompanyRecord[]>([]),[draft,setDraft]=useState<CompanyRecordProposal|null>(null),[message,setMessage]=useState(''),[filter,setFilter]=useState('active'),[search,setSearch]=useState(''),[loading,setLoading]=useState(true),[pending,start]=useTransition();
 const event=useRef('');
 async function refresh(){try{setRows(await listCompanyRecords());}catch{setMessage('Could not load company records. Try Refresh.');}finally{setLoading(false);}}
 useEffect(()=>{void refresh();},[]);
 function edit(r?:CompanyRecord){setDraft(recordDraft(kind,r));event.current='';setMessage('');}
 function change(p:Partial<CompanyRecordProposal>){setDraft(d=>d?{...d,...p}:d);event.current='';}
 const visible=rows.filter(r=>r.kind===kind&&(filter==='all'||!['completed','cancelled','superseded'].includes(r.status))&&[r.title,r.body,r.next_action].join(' ').toLowerCase().includes(search.toLowerCase())).sort((a,b)=>kind==='work'?(a.due_date??'9999').localeCompare(b.due_date??'9999')||b.updated_at.localeCompare(a.updated_at):b.updated_at.localeCompare(a.updated_at));
 const open=rows.filter(r=>r.kind==='work'&&!['completed','cancelled'].includes(r.status));
 function save(){if(!draft)return;if(!event.current)event.current=crypto.randomUUID();const payload=draft,id=event.current;start(async()=>{try{const result=await saveCompanyRecord(id,payload);setMessage(result.message);if(result.ok){setDraft(null);event.current='';await refresh();}}catch{setMessage('Could not confirm the save. Your draft is kept; retry without editing to avoid duplicate submission.');}});}
 return <section className="ember-panel">
 <div className="ember-section-heading"><div><p className="eyebrow">{kind==='work'?'COMPANY WORK':'SHARED ACROSS CHATS'}</p><h2>{kind==='work'?'Work inbox':'Company memory'}</h2></div><button className="office-record-add" disabled={pending} onClick={()=>edit()}>+ {kind==='work'?'New work item':'Add memory'}</button></div>
 <p className="muted">{kind==='work'?'Keep unfinished work, waiting replies and next steps in one place. Automatic issue detection is not enabled yet.':'Confirmed decisions, agreements and preferences stay available in new chats. Recording a rule here does not activate an automatic action.'}</p>
 {kind==='work'&&<div className="office-work-counts"><span>{open.length} open</span><span>{open.filter(r=>r.due_date&&r.due_date<today).length} past review date</span><span>{open.filter(r=>r.status.startsWith('waiting')).length} waiting</span></div>}
 <div className="ember-chips"><button aria-pressed={filter==='active'} onClick={()=>setFilter('active')}>Active</button><button aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>Including history</button><button onClick={()=>void refresh()}>Refresh</button></div>
 <input aria-label="Search company records" placeholder={kind==='work'?'Search work items…':'Search decisions and agreements…'} value={search} onChange={e=>setSearch(e.target.value)}/>
 {message&&<p className="ember-notice" role="status">{message}</p>}
 {draft&&<form className="office-record-form" onSubmit={e=>{e.preventDefault();save();}}>
  <h3>{draft.id?'Update':'New'} {kind==='work'?'work item':'memory'}</h3>
  <label>Title<input required minLength={2} maxLength={160} value={draft.title} disabled={pending} onChange={e=>change({title:e.target.value})}/></label>
  <label>{kind==='work'?'Details':'Confirmed details'}<textarea rows={3} required={kind==='memory'} maxLength={4000} value={draft.body} disabled={pending} onChange={e=>change({body:e.target.value})}/></label>
  <div className="office-record-fields"><label>Status<select value={draft.status} disabled={pending} onChange={e=>change({status:e.target.value as CompanyRecordProposal['status']})}>{(kind==='memory'?['confirmed','superseded']:['open','waiting_external','waiting_mac','needs_review',...(draft.id?['completed','cancelled']:[])]).map(s=><option key={s} value={s}>{label(s)}</option>)}</select></label>
  {kind==='memory'?<><label>Category<select value={draft.category} disabled={pending} onChange={e=>change({category:e.target.value as CompanyRecordProposal['category']})}>{['decision','agreement','preference','rule'].map(s=><option key={s} value={s}>{label(s)}</option>)}</select></label><label>Effective from<input type="date" value={draft.effectiveDate} disabled={pending} onChange={e=>change({effectiveDate:e.target.value})}/></label></>:<><label>Priority<select value={draft.priority} disabled={pending} onChange={e=>change({priority:e.target.value as CompanyRecordProposal['priority']})}>{['low','normal','high','urgent'].map(s=><option key={s} value={s}>{label(s)}</option>)}</select></label><label>Next review / due date<input type="date" value={draft.dueDate} disabled={pending} onChange={e=>change({dueDate:e.target.value})}/></label></>}</div>
  {kind==='work'&&<><label>Next action / waiting reason<textarea maxLength={1000} rows={2} value={draft.nextAction} disabled={pending} onChange={e=>change({nextAction:e.target.value})}/></label><label>Outcome and evidence{['completed','cancelled'].includes(draft.status)?' (required)':''}<textarea rows={2} maxLength={2000} value={draft.outcome} disabled={pending} onChange={e=>change({outcome:e.target.value})}/></label></>}
  <label>Source / supporting reference<input maxLength={500} value={draft.sourceRef} disabled={pending} placeholder="Owner decision, invoice ID, email thread or document reference" onChange={e=>change({sourceRef:e.target.value})}/></label>
  <p className="ember-footnote">{kind==='memory'?'Save confirms this company memory. Agreed hourly rates must still be maintained in Agreed rates; a saved rule does not grant sending or payment authority.':'Save records the work status only. It does not send a message, transfer money or mark an invoice paid.'}</p>
  <button className="ember-primary" disabled={pending} type="submit">{pending?'Saving…':kind==='memory'?'Confirm & save memory':'Save work item'}</button><button className="ember-text-button" disabled={pending} type="button" onClick={()=>setDraft(null)}>Cancel</button>
 </form>}
 {loading?<p className="muted">Loading…</p>:visible.length===0?<p className="ember-empty">No matching {kind==='work'?'work items':'company memories'}.</p>:visible.map(r=><article key={r.id} className="office-record-card">
  <div className="ember-section-heading"><h3>{r.title}</h3><span className="office-record-badge">{label(r.status)}</span></div>
  <p style={{whiteSpace:'pre-wrap'}}>{r.body}</p>
  {kind==='work'?<><p><strong>Next:</strong> {r.next_action||'—'}</p><small>{label(r.priority)} priority{r.due_date?` · Review / due ${r.due_date}`:''}{r.due_date&&r.due_date<today&&!['completed','cancelled'].includes(r.status)?' · Review date passed':''}</small>{r.outcome&&<p><strong>Outcome:</strong> {r.outcome}</p>}</>:<small>{label(r.category)}{r.effective_date?` · Effective ${r.effective_date}`:''}{r.effective_date&&r.effective_date>today?' · Future agreement':''}</small>}
  {r.source_ref&&<p className="ember-footnote">Source: {r.source_ref}</p>}
  <button className="ember-text-button" disabled={pending} onClick={()=>edit(r)}>Review / edit</button><RecordHistory id={r.id} version={r.version}/>
 </article>)}
 </section>;
}
function RecordHistory({id,version}:{id:string;version:number}){
 const [history,setHistory]=useState<Awaited<ReturnType<typeof companyRecordHistory>>|null>(null),[error,setError]=useState('');
 return <details className="office-record-history" onToggle={e=>{if(e.currentTarget.open)void companyRecordHistory(id).then(setHistory).catch(()=>setError('History could not be loaded. Close and reopen to retry.'));}}><summary>Version {version} · Change history</summary>{error&&<p>{error}</p>}{history?.map(h=><div key={h.id}><strong>Version {h.after_data.version} · {label(h.after_data.status)}</strong><small>{new Date(h.created_at).toLocaleString('en-AU',{timeZone:'Australia/Perth'})}</small><p>{h.after_data.title}</p><p style={{whiteSpace:'pre-wrap'}}>{h.after_data.body}</p>{h.after_data.outcome&&<p>Outcome: {h.after_data.outcome}</p>}</div>)}{history?.length===50&&<p>Showing the latest 50 changes. Earlier versions are retained.</p>}</details>;
}
