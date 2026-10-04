'use client';
import {useEffect,useRef,useState} from 'react';

import type {DaySaveInput} from '@/lib/office/day-save';
import type {readOfficeDay} from '@/lib/office/day-data';
import type {saveDayChanges} from '@/lib/office/day-save';
import {PeoplePicker} from './people-picker';
import {directory,type OfficeData} from '@/lib/office/foundation';
import {addIsoDays} from '@/lib/operations/dates';
import {dailyKey,dailyDraft,dayTeams,availableForSite,draftError} from '@/lib/office/daily-board';
import {readWorkDrafts,writeWorkDrafts,type WorkDraft} from '@/lib/office/work-drafts';

type Loaded=Awaited<ReturnType<typeof readOfficeDay>>;
export function DailyBoard({data,today,dateRequest,addresses,openSites}:{data:OfficeData;today:string;dateRequest:{day:string;nonce:number}|null;addresses:Record<string,string>;openSites:()=>void}){
 const [day,setDay]=useState(dateRequest?.day||today),[loaded,setLoaded]=useState<Loaded|null>(null);
 const [edits,setEdits]=useState<Record<string,string[]>>({}),[drafts,setDrafts]=useState<Record<string,WorkDraft>>({});
 const [extraSites,setExtraSites]=useState<string[]>([]),[picker,setPicker]=useState(''),[bulk,setBulk]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[restored,setRestored]=useState(false),[storageFailed,setStorageFailed]=useState(false);
 const attempts=useRef<Record<string,{key:string;id:string}>>({}),generation=useRef(0);
 const storage=data.viewerId?`office-work-drafts-v1:${data.viewerId}`:null;
 const dirty=Object.keys(edits).length>0||Object.values(drafts).some(v=>v.dirty);
 const dirtyRef=useRef(dirty);dirtyRef.current=dirty;
 useEffect(()=>{if(storage){try{const d=readWorkDrafts(localStorage.getItem(storage));setDrafts(d);if(Object.keys(d).length)setMessage('Unsaved hours restored. Select their date to continue.');}catch{setStorageFailed(true);}}setRestored(true);},[storage]);
 useEffect(()=>{if(!restored||!storage)return;try{localStorage.setItem(storage,writeWorkDrafts(drafts));}catch{setStorageFailed(true);}},[drafts,restored,storage]);
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirtyRef.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
 async function load(selected:string){const seq=++generation.current;setLoading(true);setError('');try{const response=await fetch('/api/office/day?day='+encodeURIComponent(selected),{cache:'no-store'});if(!response.ok)throw new Error('Day unavailable');const r=await response.json() as Loaded;if(seq===generation.current)setLoaded(r);}catch{if(seq===generation.current){setLoaded(null);setError('This day could not load. Your drafts are kept. Retry to continue.');}}finally{if(seq===generation.current)setLoading(false);}}
 useEffect(()=>{void load(day);return()=>{generation.current++;};},[day]);
 function changeDay(value:string){if(!value||busy)return;if(Object.keys(edits).length&&!window.confirm('Discard unsaved people changes? Entered hours stay on this device.'))return;setDay(value);setEdits({});setExtraSites([]);setPicker('');setMessage('');}
 useEffect(()=>{if(dateRequest)changeDay(dateRequest.day||today);},[dateRequest]); // request changes are explicit navigation, not an automatic refresh
 const current=loaded?.day===day?loaded:null;
 const entries=current?.entries??[],plans=current?.plans.plans??[];
 const localTeams:Record<string,string[]>={...edits};
 for(const key of Object.keys(drafts)){const [date,site,person]=key.split(':');if(date===day)localTeams[site]=Array.from(new Set([...(localTeams[site]??plans.find(p=>p.jobId===site)?.people.filter(p=>p.active).map(p=>p.id)??[]),person]));}
 const teams=dayTeams(plans,entries,localTeams);
 const siteIds=Array.from(new Set([...Object.keys(teams).filter(s=>teams[s].length),...extraSites]));
 const key=(site:string,id:string)=>dailyKey(day,site,id);
 const entry=(site:string,id:string)=>entries.find(e=>e.jobId===site&&e.workerId===id);
 const row=(site:string,id:string)=>drafts[key(site,id)]??dailyDraft(entry(site,id));
 const future=day>today;
 function patch(site:string,id:string,change:Partial<WorkDraft>){setDrafts(d=>({...d,[key(site,id)]:{...row(site,id),...change,dirty:true,error:undefined}}));}
 function actual(site:string,id:string,value:string){const r=row(site,id);patch(site,id,{actual:value,pay:r.pay===r.actual?value:r.pay,bill:r.bill===r.actual?value:r.bill});}
 function add(site:string,id:string){if(!availableForSite(id,site,teams))return;setEdits(d=>({...d,[site]:[...(teams[site]??[]),id]}));}
 function remove(site:string,id:string){if(entry(site,id))return;setEdits(d=>({...d,[site]:(teams[site]??[]).filter(v=>v!==id)}));setDrafts(d=>{const n={...d};delete n[key(site,id)];return n;});}
 function removeSite(site:string){
  if(entries.some(e=>e.jobId===site)){setMessage('This site has saved work. Its history is kept; correct the work record before removing it.');return;}
  const ownDrafts=Object.keys(drafts).filter(k=>k.startsWith(day+':'+site+':'));
  if((teams[site]?.length||ownDrafts.length)&&!window.confirm('Remove this site and its unsaved people/hours from this day?'))return;
  if(plans.some(p=>p.jobId===site))setEdits(e=>({...e,[site]:[]}));
  else setEdits(e=>{const n={...e};delete n[site];return n;});
  setDrafts(d=>{const n={...d};ownDrafts.forEach(k=>delete n[k]);return n;});
  setExtraSites(s=>s.filter(v=>v!==site));setPicker('');
 }
 async function save(){
  if(!current||busy)return;
  if(!navigator.onLine){setMessage('Offline. Keep this page open; save when connected.');return;}
  setBusy(true);setMessage('Saving this day…');
  const started=performance.now();
  try{
   const planInputs:DaySaveInput['plans']=Object.entries(edits).map(([site,ids])=>{
    const p=plans.find(p=>p.jobId===site),input={jobId:site,workDate:day,workerIds:ids,expectedVersion:p?.version??0,reminderTime:p?.reminderTime??'17:00',note:p?.note??''};
    const signature=JSON.stringify(input);
    if(attempts.current[site]?.key!==signature)attempts.current[site]={key:signature,id:crypto.randomUUID()};
    return {...input,eventId:attempts.current[site].id};
   });
   const valid:DaySaveInput['work']=[];let invalid=0;
   for(const [k,r] of Object.entries(drafts).filter(([k,r])=>k.startsWith(day+':')&&r.dirty)){
    const [,site,id]=k.split(':');const problem=future?'Future plans must not contain actual hours.':entry(site,id)?.locked?'This record is locked.':draftError(r,data.finance);
    if(problem){invalid++;setDrafts(d=>({...d,[k]:{...r,error:problem}}));continue;}
    valid.push({jobId:site,workerId:id,workDate:day,actualHours:Number(r.actual),contractorHours:data.finance?Number(r.pay):null,clientHours:data.finance?Number(r.bill):null,agreementNote:data.finance?r.note:null,expectedUpdatedAt:r.expectedUpdatedAt});
   }
   const response=await fetch('/api/office/day',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({day,plans:planInputs,work:valid})});
   if(!response.ok)throw new Error('Save could not be confirmed');
   const result=await response.json() as Awaited<ReturnType<typeof saveDayChanges>>&{snapshot:Awaited<ReturnType<typeof readOfficeDay>>|null};
   const acknowledged=result.plans.filter(p=>p.ok);
   acknowledged.forEach(p=>delete attempts.current[p.site]);
   setEdits(e=>{const n={...e};acknowledged.forEach(p=>delete n[p.site]);return n;});
   setDrafts(d=>{const n={...d};for(const r of result.work){if(r.ok)delete n[r.key];else if(n[r.key])n[r.key]={...n[r.key],error:r.message};}return n;});
   if(result.snapshot){setLoaded(result.snapshot);setError('');window.dispatchEvent(new CustomEvent('office-work-saved',{detail:result.snapshot}));}
   else {setLoaded(null);setError('Saved changes were acknowledged, but this day could not refresh. Retry to load current records before editing.');}
   const failures=invalid+result.plans.filter(p=>!p.ok).length+result.work.filter(r=>!r.ok).length;
   setMessage(`${acknowledged.length} site plans · ${result.work.filter(r=>r.ok).length} hours records saved (${((performance.now()-started)/1000).toFixed(1)}s).${failures?' Some changes need attention; their drafts are kept.':''}${result.plans.find(p=>!p.ok)?.message??''}`);
  }catch{setMessage('Save could not be confirmed. Your changes are kept; retry safely.');}
  finally{setBusy(false);}
 }
 const changedToday=Object.entries(drafts).filter(([k,v])=>k.startsWith(day+':')&&v.dirty).length;
 return <section className="daily-board">
  <div className="daily-toolbar"><div className="ember-chips"><button aria-pressed={day===today} disabled={busy} onClick={()=>changeDay(today)}>Today</button><button aria-pressed={day===addIsoDays(today,1)} disabled={busy} onClick={()=>changeDay(addIsoDays(today,1))}>Tomorrow</button></div><input aria-label="Daily date" type="date" value={day} max={addIsoDays(today,366)} disabled={busy} onChange={e=>changeDay(e.target.value)}/></div>
  <p className="muted"><strong>{siteIds.length} sites · {new Set(Object.values(teams).flat()).size} people</strong><br/>{future?'Choose sites and people. Enter their hours after the work is done.':'Sites, people and hours — all in one place.'}</p>
  {loading&&<p role="status">Loading this day…</p>}{error&&<p role="alert">{error} <button disabled={busy} onClick={()=>void load(day)}>Retry</button></p>}
  <fieldset disabled={busy||loading||!current} className="daily-fields">
   <label className="daily-add-site">Add a site<select aria-label="Add a site" value="" onChange={e=>{setExtraSites(s=>[...s,e.target.value]);setPicker(e.target.value);}}><option value="">Choose client / site…</option>{data.projects.filter(p=>p.active&&!siteIds.includes(p.id)).map(p=><option key={p.id} value={p.id}>{data.clients.find(c=>c.id===p.clientId)?.name} · {p.name}</option>)}</select></label>
   {!siteIds.length&&!loading&&<p className="ember-empty">Choose a site above, then add your people.</p>}
   {siteIds.map(site=>{const project=data.projects.find(p=>p.id===site),plan=plans.find(p=>p.jobId===site),ids=teams[site]??[];
    const people=ids.map(id=>data.contractors.find(p=>p.id===id)??{id,fullName:plan?.people.find(p=>p.id===id)?.fullName||'Saved contractor',shortName:''});

    return <article className="daily-site" key={site}>
     <header><small>{data.clients.find(c=>c.id===project?.clientId)?.name||plan?.client}</small><h2>{project?.name||plan?.site||'Saved site'}</h2>{addresses[site]&&<p>{addresses[site]}</p>}<div className="daily-site-heading-actions"><strong>{ids.length} selected</strong><button type="button" onClick={()=>removeSite(site)} disabled={entries.some(e=>e.jobId===site)}>Remove site</button></div></header>
     <table><thead><tr><th>Contractor</th><th>Hours</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{people.map(p=>{const r=row(site,p.id),e=entry(site,p.id),locked=!!e?.locked;return <tr key={p.id}><td><strong>{p.shortName||p.fullName}</strong><small className={r.error?'error':''}>{r.error|| (r.dirty?'Unsaved':locked?'Locked':e?'Saved ✓':'Planned')}</small>{data.finance&&<details><summary>Details</summary>{p.shortName&&<small>{p.fullName}</small>}<label>Payable hours<input aria-label={`${p.fullName} payable hours`} type="number" step="0.01" min="0" max="24" disabled={future||locked} value={r.pay} onChange={v=>patch(site,p.id,{pay:v.target.value})}/></label><label>Client hours<input aria-label={`${p.fullName} client hours`} type="number" step="0.01" min="0" max="24" disabled={future||locked} value={r.bill} onChange={v=>patch(site,p.id,{bill:v.target.value})}/></label><label>Agreement / note<input disabled={future||locked} value={r.note} onChange={v=>patch(site,p.id,{note:v.target.value})}/></label></details>}</td><td><input aria-label={`${p.fullName} actual hours`} inputMode="decimal" type="number" step="0.01" min="0" max="24" placeholder="—" value={r.actual} disabled={future||locked} onChange={v=>actual(site,p.id,v.target.value)}/></td><td>{!e&&<button className="daily-remove" aria-label={`Remove ${p.fullName} from site`} onClick={()=>remove(site,p.id)}>×</button>}</td></tr>;})}</tbody></table>
     <div className="daily-site-actions"><button onClick={()=>{setPicker(picker===site?'':site);}}>+ Add people</button>{!future&&people.length>1&&<div className="daily-bulk"><input aria-label={`Hours for everyone at ${project?.name}`} inputMode="decimal" type="number" min="0" max="24" step="0.01" placeholder="Hours" value={bulk[site]??''} onChange={e=>setBulk(v=>({...v,[site]:e.target.value}))}/><button disabled={!/^\d+(\.\d{1,2})?$/.test(bulk[site]??'')||Number(bulk[site])>24} onClick={()=>people.filter(p=>!entry(site,p.id)?.locked).forEach(p=>actual(site,p.id,bulk[site]))}>Apply to all</button></div>}</div>

    </article>;
   })}
  </fieldset>
  {picker&&<PeoplePicker siteName={data.projects.find(p=>p.id===picker)?.name||'Site'} people={directory(data.contractors).filter(p=>(teams[picker]??[]).includes(p.id)||p.active&&availableForSite(p.id,picker,teams))} selected={teams[picker]??[]} locked={entries.filter(e=>e.jobId===picker).map(e=>e.workerId)} toggle={id=>(teams[picker]??[]).includes(id)?remove(picker,id):add(picker,id)} close={()=>setPicker('')}/>}

  <div className="daily-save"><button className="ember-primary" disabled={busy||loading||!current||!Object.keys(edits).length&&!changedToday} onClick={()=>void save()}>{busy?'Saving…':'Save day'}</button><span>{Object.keys(edits).length+changedToday?'Unsaved changes':loading?'Loading…':error?'Not loaded':'All changes saved'}</span></div>
  {message&&<p className="ember-notice" role="status">{message}</p>}
  {storageFailed&&<p role="alert">Device storage is unavailable. Keep this page open until Save succeeds.</p>}
  <button className="ember-text-button" disabled={busy} onClick={openSites}>Manage sites</button>
 </section>;
}
