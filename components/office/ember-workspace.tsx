"use client";
import { useEffect, useState, useTransition, type CSSProperties } from "react";
import type {MacSync} from "@/lib/office/mac-sync";
import type {InvoiceEvent} from "@/lib/office/invoice-events";
import {InvoiceRegister} from "./invoice-register";
import type {InvoiceSnapshot} from "@/lib/office/invoice-snapshot";
import {logout} from "@/app/actions/auth";
import {LocationsPanel,ClientsAndAccessPanel,ClientInvoiceHistory,type CompanyManagementData} from "./company-management";
import type {OperationsActionResult} from "@/app/actions/operations";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CalendarDays, Sparkles, CheckCheck, Building2, Plus, ArrowUpRight, Users, Clock3, MapPin, Wallet, FileText } from "lucide-react";
import { saveOfficeWork, type OfficeResult } from "@/app/actions/office";
import { directory, type OfficeData, type OfficeEntry } from "@/lib/office/foundation";
import { Contacts, History, Rates } from "./office-workspace";
import { ContactImportReview } from "./contact-import-review";
import "./ember.css";
import {ClientDrafts} from "./client-drafts";
import {CompanyRecords} from './company-records';
import {OperationalReadiness} from './operational-readiness';
import {activeContactImports} from '@/lib/office/readiness';
import {OfficeBrief} from './office-brief';
import {DocumentCatalog} from './document-catalog';
import {MailAttention} from './mail-watch';
import {AssistantChat} from "./assistant-chat";

import {readWorkDrafts,writeWorkDrafts,type WorkDraft as Draft} from '@/lib/office/work-drafts';
const initial=(e?:OfficeEntry):Draft=>({actual:e?String(e.actualHours):"",pay:e?String(e.contractorHours??e.actualHours):"",bill:e?String(e.clientHours??e.actualHours):"",note:e?.agreementNote??"",adjust:!!e&&(e.contractorHours!==e.actualHours||e.clientHours!==e.actualHours),dirty:false,expectedUpdatedAt:e?.updatedAt??null});
const colors=["#b4a0e8","#83b9e1","#92cdb8","#e8b783"];
const clientColor=(id:string)=>colors[Array.from(id).reduce((n,c)=>n+c.charCodeAt(0),0)%colors.length];
export function EmberWorkspace({data,management,snapshot,invoiceEvents,macSync,today,initialTab="daily"}:{data:OfficeData;snapshot:InvoiceSnapshot|null;invoiceEvents:InvoiceEvent[];macSync:MacSync;management:CompanyManagementData;today:string;initialTab?:"daily"|"history"|"invoices"}) {
 const router=useRouter();
 const [billingPreset,setBillingPreset]=useState<{clientId:string;from:string;to:string}|null>(null);
 const [tab,setTab]=useState(initialTab==="invoices"&&data.finance?"money":initialTab==="history"?"sites":"today");
 const [section,setSection]=useState(initialTab==="invoices"?"contractor-invoices":initialTab==="history"?"history":"daily");
 const [requestedSite,setRequestedSite]=useState<{id:string;nonce:number}|null>(null);
 const [pending,start]=useTransition();const [notice,setNotice]=useState<OfficeResult|null>(null);
 const currentContactImports=activeContactImports(data,snapshot);
 const count=currentContactImports.filter(i=>i.status==="pending").length;
 const run=(action:()=>Promise<OfficeResult>)=>start(async()=>{try{const r=await action();setNotice(r);if(r.ok)router.refresh();}catch{setNotice({ok:false,message:"Could not save. Please try again."});}});
 const runManagement=(action:()=>Promise<OperationsActionResult>)=>run(async()=>{const r=await action();return {ok:r.ok,message:r.message??r.error??(r.ok?"Saved.":"Could not save.")};});
 function navigate(destination:string){
  if(destination==="today"){setTab("today");return;}
  if(destination==="assistant"){setTab("assistant");return;}
  if(["contractor-invoices","invoices","rates"].includes(destination)){setSection(destination);setTab("money");return;}
  if(["daily","sites","history"].includes(destination)){setSection(destination);setTab("sites");return;}
  setSection(destination==="company"?"contacts":destination);setTab("company");
 }
 const headings:Record<string,string>={today:"Your day, organised.",sites:"Sites & work.",assistant:"Meet your assistant.",money:"Payments & invoices.",company:"Your company."};
 const navItems=[["today","Today",CalendarDays],["sites","Sites",MapPin],...(data.finance?[["assistant","Assistant",Sparkles],["money","Money",Wallet]]:[]),["company","Company",Building2]] as const;
 const activeSites=data.projects.filter(p=>p.active&&data.clients.some(c=>c.id===p.clientId&&c.active));
 return <main className={`ember ${tab==="assistant"&&data.finance?"ember-chat-mode":""}`}><div className="ember-shell">
 <header className="ember-top"><a href="/office" className="ember-brand"><Image src="/assets/logo/logo-icon-light.svg" alt="Still Partners" width="38" height="38"/><span>STILL PARTNERS<small>YOUR COMPANY OFFICE</small></span></a><form action={logout}><button type="submit" className="ember-text-button">Sign out</button></form></header>
 <div className="ember-content"><div className="ember-heading"><p className="eyebrow">STILL PARTNERS / OFFICE</p><h1>{headings[tab]}</h1><p className="muted">{new Intl.DateTimeFormat("en-AU",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"Australia/Perth"}).format(new Date(today+"T12:00:00+08:00"))}</p></div>
 {data.finance&&<MailAttention open={()=>navigate("work")}/>}
 {notice&&<p role="status" className={notice.ok?"ember-notice":"ember-notice error"}>{notice.message}</p>}
 {tab==="today"&&<>
 <section className="ember-agent"><div className="orb"/><div><p className="eyebrow">TODAY AT A GLANCE</p><p>{data.entries.filter(e=>e.workDate===today).length} work records today · {activeSites.length} active sites</p><button onClick={()=>navigate("daily")}>Record site work <ArrowUpRight size={15}/></button></div></section>
 {data.finance&&<><OfficeBrief data={data} snapshot={snapshot} events={invoiceEvents} today={today} navigate={navigate} prepare={(clientId,from,to)=>{setBillingPreset({clientId,from,to});navigate("invoices");}}/><OperationalReadiness sync={macSync} data={data} snapshot={snapshot} day={today} navigate={navigate}/><p><a className="ember-link" href="/office/mail">Work Gmail · search messages & files →</a></p><h2>Needs your review</h2><div className="office-home-actions">
 <button onClick={()=>navigate("reviews")}><CheckCheck size={20}/><strong>Contact reviews <span className="office-count">{count}</span></strong><small>Review imported identities</small></button>
 <button onClick={()=>navigate("contractor-invoices")}><Wallet size={20}/><strong>Contractor payments</strong><small>Review invoices and record payments</small></button>
 <button onClick={()=>navigate("invoices")}><FileText size={20}/><strong>Client invoices</strong><small>Review drafts and outgoing messages</small></button>
 <button onClick={()=>navigate("work")}><Clock3 size={20}/><strong>Work inbox</strong><small>Open work and waiting replies</small></button>
 </div></>}
 <div className="ember-section-heading"><h2>Your sites</h2><button className="ember-text-button" onClick={()=>navigate("sites")}>Manage sites</button></div>
 <p className="muted">Active sites, not a confirmed schedule. Choose where work took place.</p>
 <div className="ember-site-grid">{activeSites.map(p=><button className="ember-site" key={p.id} style={{"--client":clientColor(p.clientId)} as CSSProperties} onClick={()=>{setRequestedSite({id:p.id,nonce:Date.now()});navigate("daily");}}><span className="client-label">{data.clients.find(c=>c.id===p.clientId)?.name}</span><strong>{p.name}</strong><small>Open work records <ArrowUpRight size={14}/></small></button>)}</div>
 {!activeSites.length&&<p className="ember-empty">No active sites yet.</p>}
 </>}
 <div hidden={tab!=="sites"}>
 <div className="ember-chips" aria-label="Site sections">{[["daily","Daily records"],["history","Work history"],["sites","Manage sites"]].map(([id,label])=><button key={id} aria-pressed={section===id} onClick={()=>setSection(id)}>{label}</button>)}</div>
 <div hidden={section!=="daily"}><SiteDay data={data} today={today} requestedSite={requestedSite} openSites={()=>navigate("sites")}/></div>
 {tab==="sites"&&section==="history"&&<History data={data}/>}
 {tab==="sites"&&section==="sites"&&<LocationsPanel data={management} isPending={pending} runAction={runManagement}/>}
 </div>
 {tab==="assistant"&&data.finance&&<AssistantChat clients={data.clients} navigate={navigate}/>}
 {tab==="money"&&data.finance&&<>
 <div className="ember-chips" aria-label="Money sections">{[["contractor-invoices","Contractor payments"],["invoices","Client invoices"],["rates","Agreed rates"]].map(([id,label])=><button key={id} aria-pressed={section===id} onClick={()=>setSection(id)}>{label}</button>)}</div>
 {section==="contractor-invoices"&&<InvoiceRegister data={data} snapshot={snapshot} events={invoiceEvents} today={today} sync={macSync}/>}
 {section==="invoices"&&<><ClientDrafts preset={billingPreset} clients={data.clients} today={today} from={data.from} to={data.to}/><details><summary>Historical client records</summary><p className="ember-footnote">Earlier records are retained for reference. Drafts remain labelled as drafts; no payment date has been inferred.</p><ClientInvoiceHistory data={management}/></details></>}
 {section==="rates"&&<Rates data={data} today={today} pending={pending} run={run}/>}
 </>}
 {tab==="company"&&<>
 <div className="ember-chips" aria-label="Company sections">{(data.finance?[["contacts","Contractors"],["clients","Clients & access"],["documents","Documents"],["work","Work inbox"],["memory","Company memory"],["reviews","Contact reviews"]]:[["sites","Clients & sites"]]).map(([id,label])=><button key={id} aria-pressed={section===id} onClick={()=>setSection(id)}>{label}</button>)}</div>
 {section==="documents"&&data.finance&&<DocumentCatalog data={data} today={today}/>}
 {(section==="work"||section==="memory")&&data.finance&&<CompanyRecords key={section} kind={section==="work"?"work":"memory"} today={today} navigate={navigate}/>}
 {section==="contacts"&&data.finance&&<Contacts data={data} pending={pending} run={run}/>}
 {section==="clients"&&data.finance&&<ClientsAndAccessPanel data={management} isPending={pending} runAction={runManagement}/>}
 {section==="reviews"&&data.finance&&<><h2>{count} contact sources to review</h2><ContactImportReview items={currentContactImports} people={data.contractors} pending={pending} run={run}/></>}
 {!data.finance&&<LocationsPanel data={management} isPending={pending} runAction={runManagement}/>}
 </>}
 </div>
 <nav className="ember-nav office-main-nav" aria-label="Main navigation">{navItems.map(([id,label,Icon])=>{const Glyph=Icon as typeof CalendarDays;return <button key={String(id)} aria-current={tab===id?"page":undefined} className={id==="assistant"?"office-assistant-tab":""} onClick={()=>navigate(id==="sites"?"daily":id==="money"?"contractor-invoices":String(id))}><Glyph size={21}/><span>{String(label)}</span></button>;})}</nav>
 </div></main>;
}
function SiteDay({data,today,openSites,requestedSite}:{data:OfficeData;today:string;openSites:()=>void;requestedSite:{id:string;nonce:number}|null}) {
 const router=useRouter();const [day,setDay]=useState(data.from===data.to?data.from:today);const [site,setSite]=useState("");const [drafts,setDrafts]=useState<Record<string,Draft>>({});const [picker,setPicker]=useState(false);const [search,setSearch]=useState("");const [all,setAll]=useState("");const [saving,setSaving]=useState(false);const [message,setMessage]=useState("");
 useEffect(()=>{if(requestedSite)setSite(requestedSite.id);},[requestedSite]);
 const key=(id:string)=>`${day}:${site}:${id}`;const entries=data.entries.filter(e=>e.workDate===day&&e.jobId===site);const entry=(id:string)=>entries.find(e=>e.workerId===id);const row=(id:string)=>drafts[key(id)]??initial(entry(id));
 const dirty=Object.values(drafts).some(d=>d.dirty);
 const storageKey=data.viewerId?`office-work-drafts-v1:${data.viewerId}`:null;
 const [draftsLoaded,setDraftsLoaded]=useState(false);const [storageFailed,setStorageFailed]=useState(false);
 useEffect(()=>{if(storageKey){try{const restored=readWorkDrafts(localStorage.getItem(storageKey));setDrafts(restored);if(Object.keys(restored).length)setMessage('Unsaved work restored on this device. Choose its date and site, then save when online.');}catch{setStorageFailed(true);}}setDraftsLoaded(true);},[storageKey]);
 useEffect(()=>{if(draftsLoaded&&storageKey){try{localStorage.setItem(storageKey,writeWorkDrafts(drafts));setStorageFailed(false);}catch{setStorageFailed(true);}}},[drafts,draftsLoaded,storageKey]);
 useEffect(()=>{const connected=()=>setMessage('Back online. Save work records to submit your retained drafts.');window.addEventListener('online',connected);return()=>window.removeEventListener('online',connected);},[]);
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[dirty]);
 const people=directory(data.contractors).filter(p=>entry(p.id)||drafts[key(p.id)]);
 const outside=day<data.from||day>data.to;const project=data.projects.find(p=>p.id===site);
 function patch(id:string,change:Partial<Draft>) {setDrafts(d=>({...d,[key(id)]:{...row(id),...change,dirty:true,saved:false,error:undefined}}));}
 function add(ids:string[]){setDrafts(d=>{const next={...d};ids.forEach(id=>{if(!next[key(id)]&&!entry(id))next[key(id)]=initial();});return next;});}
 function actual(id:string,value:string){const r=row(id);patch(id,{actual:value,pay:r.pay===r.actual?value:r.pay,bill:r.bill===r.actual?value:r.bill});}
 function previous(){const dates=data.entries.filter(e=>e.jobId===site&&e.workDate<day).map(e=>e.workDate).sort();const last=dates.at(-1);if(!last){setMessage("No previous team found in the loaded date range.");return;}add(data.entries.filter(e=>e.jobId===site&&e.workDate===last).map(e=>e.workerId).filter(id=>data.contractors.some(p=>p.id===id&&p.active)));setMessage("Previous team added. Enter today’s hours; earlier hours were not copied.");}
 async function save(){if(!navigator.onLine){setMessage('Offline. Your hours are retained on this device; save them when connected.');return;}setSaving(true);setMessage("");let ok=0,failed=0;for(const p of people){const r=row(p.id);if(!r.dirty||entry(p.id)?.locked)continue;let error="";if(!r.actual||!/^\d+(\.\d{1,2})?$/.test(r.actual)||Number(r.actual)>24)error="Enter actual hours between 0 and 24 (up to 2 decimals).";if(data.finance&&(!r.pay||!r.bill||!/^\d+(\.\d{1,2})?$/.test(r.pay)||!/^\d+(\.\d{1,2})?$/.test(r.bill)||Number(r.pay)>24||Number(r.bill)>24))error="Enter valid payable and billable hours.";if(data.finance&&(Number(r.pay)!==Number(r.actual)||Number(r.bill)!==Number(r.actual))&&r.note.trim().length<3)error="Add the agreed reason for different hours.";
 if(!error){try{const result=await saveOfficeWork({workerId:p.id,jobId:site,workDate:day,actualHours:Number(r.actual),contractorHours:data.finance?Number(r.pay):null,clientHours:data.finance?Number(r.bill):null,agreementNote:data.finance?r.note:null,expectedUpdatedAt:r.expectedUpdatedAt});if(!result.ok)error=result.message;}catch{error="Save could not be confirmed. Reload the date before retrying.";}}
 const rowKey=key(p.id);setDrafts(d=>({...d,[rowKey]:{...r,dirty:!!error,saved:!error,error}}));if(error)failed++;else ok++;}
 setMessage(`${ok} saved${failed?` · ${failed} need attention. Saved rows will not be submitted again.`:". Work records updated."}`);setSaving(false);router.refresh();}
 return <section><div className="ember-section-heading"><h2>Today’s sites</h2><label className="ember-date"><CalendarDays size={16}/><input aria-label="Work date" type="date" value={day} max={today} disabled={saving} onChange={e=>{setDay(e.target.value);setMessage("");}}/></label></div><p className="muted">Choose a site, then add your team.</p><div className="ember-site-grid">{data.projects.filter(p=>p.active&&data.clients.some(c=>c.id===p.clientId&&c.active)).map(p=><button className={`ember-site ${site===p.id?"selected":""}`} disabled={saving} aria-pressed={site===p.id} key={p.id} style={{"--client":clientColor(p.clientId)} as CSSProperties} onClick={()=>{setSite(p.id);setPicker(false);setMessage("");}}><span className="client-label">{data.clients.find(c=>c.id===p.clientId)?.name}</span><strong>{p.name}</strong><small>{data.entries.filter(e=>e.jobId===p.id&&e.workDate===day).length} recorded <ArrowUpRight size={14}/></small></button>)}</div>
 {!data.projects.some(p=>p.active)&&<p className="ember-panel">No active sites are available. Add a site in <button className="ember-link" onClick={openSites}>Sites → Manage sites</button>.</p>}
 {outside?<p className="ember-notice">Load the selected date to edit its records. {dirty?"Save your entered hours before loading another range.":<a href={`/office?from=${day}&to=${day}`}>Load selected date</a>}</p>:site?<section className="ember-panel"><div className="ember-section-heading"><div><p className="eyebrow">{project?.name}</p><h2>Your team <span className="muted">{people.length}</span></h2></div><Users size={20}/></div><div className="ember-chips"><button disabled={saving} onClick={()=>setPicker(!picker)}><Plus size={15}/> Add contractors</button><button disabled={saving} onClick={previous}>Previous team</button></div>
 {picker&&<div className="ember-picker"><input aria-label="Search contractors" placeholder="Search full name…" value={search} onChange={e=>setSearch(e.target.value)}/>{directory(data.contractors,search).filter(p=>p.active&&!people.some(x=>x.id===p.id)).map(p=><button disabled={saving} key={p.id} onClick={()=>add([p.id])}><Plus size={15}/>{p.fullName}<small>{p.group==="occasional"?"Occasional":"Regular"}</small></button>)}</div>}
 {people.length>0&&<div className="ember-bulk"><Clock3 size={18}/><input aria-label="Hours to apply to all" type="number" min="0" max="24" step="0.01" placeholder="Hours" value={all} disabled={saving} onChange={e=>setAll(e.target.value)}/><button disabled={saving||all===""||Number(all)<0||Number(all)>24} onClick={()=>{people.filter(p=>!entry(p.id)?.locked&&!row(p.id).saved).forEach(p=>actual(p.id,all));}}>Apply to all</button></div>}
 {people.map(p=>{const r=row(p.id);const locked=!!entry(p.id)?.locked;const disabled=saving||locked||!!r.saved;return <article className="ember-person" key={p.id}><div className="ember-person-top"><div><strong>{p.fullName}</strong><small>{locked?"Locked / invoiced":r.saved?"Saved ✓":r.dirty?"Unsaved changes":entry(p.id)?"Recorded":"Hours not entered"}</small></div><label>Actual hours<input aria-label={`${p.fullName} actual hours`} type="number" min="0" max="24" step="0.01" inputMode="decimal" placeholder="—" value={r.actual} disabled={disabled} onChange={e=>actual(p.id,e.target.value)}/></label></div>{data.finance&&<button className="ember-text-button" disabled={disabled} onClick={()=>patch(p.id,{adjust:!r.adjust})}>{r.adjust?"Hide adjustment":"Adjustment"}</button>}{r.adjust&&data.finance&&<div className="ember-adjust"><label>Contractor hours<input type="number" min="0" max="24" step="0.01" value={r.pay} disabled={disabled} onChange={e=>patch(p.id,{pay:e.target.value})}/></label><label>Client hours<input type="number" min="0" max="24" step="0.01" value={r.bill} disabled={disabled} onChange={e=>patch(p.id,{bill:e.target.value})}/></label><label className="wide">Agreement / reason<input value={r.note} disabled={disabled} onChange={e=>patch(p.id,{note:e.target.value})}/></label></div>}{r.saved&&entry(p.id)&&<button className="ember-text-button" disabled={saving} onClick={()=>setDrafts(d=>({...d,[key(p.id)]:initial(entry(p.id))}))}>Edit saved hours</button>}{r.error&&<p className="error" role="alert">{r.error}</p>}{!entry(p.id)&&!r.saved&&<button className="ember-text-button" disabled={saving} onClick={()=>{if(r.dirty&&!window.confirm("Remove this unsaved row?"))return;setDrafts(d=>{const n={...d};delete n[key(p.id)];return n;});}}>Remove from team</button>}</article>;})}
 {!people.length&&<p className="ember-empty">Add the contractors who worked at this site.</p>}
 <button className="ember-primary" disabled={saving||!people.some(p=>row(p.id).dirty&&!entry(p.id)?.locked)} onClick={save}>{saving?"Saving work records…":"Save work records"}</button><p className="ember-footnote">Actual work, contractor payable hours and client billable hours remain separate.</p></section>:<p className="ember-empty">Select a site above to start.</p>}
 {message&&<p className="ember-notice" role="status">{message}</p>}{dirty&&<p className="ember-footnote">{storageFailed||!storageKey?'Device storage unavailable. Keep this page open until your hours save online.':'Unsaved hours are retained on this device across tabs and reloads. They are not submitted until Save succeeds.'}</p>}
 </section>;
}
