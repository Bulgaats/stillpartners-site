"use client";
import { useEffect, useState, useTransition, type CSSProperties } from "react";
import {logout} from "@/app/actions/auth";
import {LocationsPanel,ClientsAndAccessPanel,ClientInvoiceHistory,type CompanyManagementData} from "./company-management";
import type {OperationsActionResult} from "@/app/actions/operations";
import Image from "next/image";
import { CalendarDays, Sparkles, CheckCheck, Building2, ArrowUpRight, Clock3, MapPin, Wallet, FileText } from "lucide-react";
import { type OfficeResult } from "@/app/actions/office";
import { type OfficeData } from "@/lib/office/foundation";
import { Contacts, History, Rates } from "./office-workspace";
import { ContactImportReview } from "./contact-import-review";
import "./ember.css";
import {CompanyRecords} from './company-records';
import {OperationalReadiness} from './operational-readiness';
import {activeContactImports} from '@/lib/office/readiness';
import {OfficeBrief} from './office-brief';
import {DocumentCatalog} from './document-catalog';
import {MailAttention} from './mail-watch';
import {PlanAttention} from './site-plans';
import {addIsoDays} from '@/lib/operations/dates';
import {DailyBoard} from './daily-board';

import dynamic from 'next/dynamic';
import {loadOfficeFinance} from '@/app/actions/office-finance';
const InvoiceRegister=dynamic(()=>import('./invoice-register').then(m=>m.InvoiceRegister),{loading:()=> <p role="status">Opening invoices…</p>});
const ClientDrafts=dynamic(()=>import('./client-drafts').then(m=>m.ClientDrafts),{loading:()=> <p role="status">Opening client billing…</p>});
const AssistantChat=dynamic(()=>import('./assistant-chat').then(m=>m.AssistantChat),{loading:()=> <p role="status">Opening Bobby…</p>});
const colors=["#b4a0e8","#83b9e1","#92cdb8","#e8b783"];
const clientColor=(id:string)=>colors[Array.from(id).reduce((n,c)=>n+c.charCodeAt(0),0)%colors.length];
export function EmberWorkspace({data:initialData,management,today,initialPlanDate,initialTab="daily"}:{data:OfficeData;management:CompanyManagementData;today:string;initialPlanDate?:string;initialTab?:"daily"|"history"|"invoices"|"plans"}) {
 const [data,setData]=useState(initialData);
 useEffect(()=>setData(initialData),[initialData]);
 useEffect(()=>{const saved=(event:Event)=>{
  const snapshot=(event as CustomEvent<{day:string;entries:OfficeData['entries']}>).detail;
  if(snapshot?.day&&snapshot.entries)setData(d=>({...d,entries:[...d.entries.filter(e=>e.workDate!==snapshot.day),...snapshot.entries]}));
 };window.addEventListener('office-work-saved',saved);return()=>window.removeEventListener('office-work-saved',saved);},[]);

 const [billingPreset,setBillingPreset]=useState<{clientId:string;from:string;to:string}|null>(null);
 const [tab,setTab]=useState(initialTab==="invoices"&&data.finance?"money":"sites");
 const [section,setSection]=useState(initialTab==="invoices"?"contractor-invoices":initialTab==="history"?"history":"daily");
 const needsFinance=data.finance&&(tab==="money"||tab==="today"||tab==="company"&&section==="reviews");
 const [finance,setFinance]=useState<{basis:OfficeData;value:Awaited<ReturnType<typeof loadOfficeFinance>>}|null>(null);
 const [financeLoading,setFinanceLoading]=useState(false),[financeError,setFinanceError]=useState(''),[financeRetry,setFinanceRetry]=useState(0);
 useEffect(()=>{
  if(!needsFinance){setFinance(null);return;}
  let alive=true;setFinanceLoading(true);setFinanceError('');
  void loadOfficeFinance(data.from,data.to).then(value=>{if(alive)setFinance({basis:data,value});}).catch(e=>{if(alive){setFinance(null);setFinanceError(e instanceof Error?e.message:'Finance could not load. Please retry.');}}).finally(()=>{if(alive)setFinanceLoading(false);});
  return()=>{alive=false;};
 },[needsFinance,data,financeRetry]);
 const financeReady=finance?.basis===data&&!financeLoading;
 const snapshot=finance?.value.snapshot??null,invoiceEvents=finance?.value.invoiceEvents??[],macSync=finance?.value.macSync??{devices:[],receipts:[]};
 const financeManagement={...management,clientInvoices:finance?.value.clientInvoices??[]};
 const [planDate,setPlanDate]=useState<{day:string;nonce:number}|null>(initialPlanDate?{day:initialPlanDate,nonce:0}:null);
 const openPlans=(day:string)=>{setPlanDate({day,nonce:Date.now()});setSection("daily");setTab("sites");};
 const [pending,start]=useTransition();const [notice,setNotice]=useState<OfficeResult|null>(null);
 const currentContactImports=financeReady?activeContactImports(data,snapshot):[];
 const count=currentContactImports.filter(i=>i.status==="pending").length;
 const run=(action:()=>Promise<OfficeResult>)=>start(async()=>{try{const r=await action();setNotice(r);}catch{setNotice({ok:false,message:"Could not save. Please try again."});}});
 const runManagement=(action:()=>Promise<OperationsActionResult>)=>run(async()=>{const r=await action();return {ok:r.ok,message:r.message??r.error??(r.ok?"Saved.":"Could not save.")};});
 function navigate(destination:string){
  if(destination==="today"){setTab("today");return;}
  if(destination==="assistant"){setTab("assistant");return;}
  if(["contractor-invoices","invoices","rates"].includes(destination)){setSection(destination);setTab("money");return;}
  if(["daily","sites","history","plans"].includes(destination)){setSection(destination==="plans"?"daily":destination);setTab("sites");return;}
  setSection(destination==="company"?"contacts":destination);setTab("company");
 }
 const headings:Record<string,string>={today:"Your day, organised.",sites:"Your daily work.",assistant:"Meet your assistant.",money:"Payments & invoices.",company:"Your company."};
 const navItems=[["sites","Daily",CalendarDays],["today","Overview",MapPin],...(data.finance?[["assistant","Assistant",Sparkles],["money","Money",Wallet]]:[]),["company","Company",Building2]] as const;
 const activeSites=data.projects.filter(p=>p.active&&data.clients.some(c=>c.id===p.clientId&&c.active));
 return <main className={`ember ${tab==="assistant"&&data.finance?"ember-chat-mode":""}`}><div className="ember-shell">
 <header className="ember-top"><a href="/office" className="ember-brand"><Image src="/assets/logo/logo-icon-light.svg" alt="Still Partners" width="38" height="38"/><span>STILL PARTNERS<small>YOUR COMPANY OFFICE</small></span></a><form action={logout}><button type="submit" className="ember-text-button">Sign out</button></form></header>
 <div className="ember-content"><div className="ember-heading"><p className="eyebrow">STILL PARTNERS / OFFICE</p><h1>{headings[tab]}</h1><p className="muted">{new Intl.DateTimeFormat("en-AU",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"Australia/Perth"}).format(new Date(today+"T12:00:00+08:00"))}</p></div>
 {tab==="today"&&<PlanAttention open={openPlans}/>}
 {tab==="today"&&data.finance&&<MailAttention open={()=>navigate("work")}/>}
 {notice&&<p role="status" className={notice.ok?"ember-notice":"ember-notice error"}>{notice.message}</p>}
 {needsFinance&&!financeReady&&<p className="ember-notice" role={financeError?"alert":"status"}>{financeError||"Loading finance records…"}{financeError&&<button onClick={()=>setFinanceRetry(v=>v+1)}>Retry</button>}</p>}
 {tab==="today"&&<>
 <div className="ember-chips"><button className="ember-primary" onClick={()=>openPlans(addIsoDays(today,1))}>Plan tomorrow’s sites →</button></div>
 <section className="ember-agent"><div className="orb"/><div><p className="eyebrow">TODAY AT A GLANCE</p><p>{data.entries.filter(e=>e.workDate===today).length} work records today · {activeSites.length} active sites</p><button onClick={()=>navigate("daily")}>Record site work <ArrowUpRight size={15}/></button></div></section>
 {data.finance&&financeReady&&<><OfficeBrief data={data} snapshot={snapshot} events={invoiceEvents} today={today} navigate={navigate} prepare={(clientId,from,to)=>{setBillingPreset({clientId,from,to});navigate("invoices");}}/><OperationalReadiness sync={macSync} data={data} snapshot={snapshot} day={today} navigate={navigate}/><p><a className="ember-link" href="/office/mail">Work Gmail · search messages & files →</a></p><h2>Needs your review</h2><div className="office-home-actions">
 <button onClick={()=>navigate("reviews")}><CheckCheck size={20}/><strong>Contact reviews <span className="office-count">{count}</span></strong><small>Review imported identities</small></button>
 <button onClick={()=>navigate("contractor-invoices")}><Wallet size={20}/><strong>Contractor payments</strong><small>Review invoices and record payments</small></button>
 <button onClick={()=>navigate("invoices")}><FileText size={20}/><strong>Client invoices</strong><small>Review drafts and outgoing messages</small></button>
 <button onClick={()=>navigate("work")}><Clock3 size={20}/><strong>Work inbox</strong><small>Open work and waiting replies</small></button>
 </div></>}
 <div className="ember-section-heading"><h2>Your sites</h2><button className="ember-text-button" onClick={()=>navigate("sites")}>Manage sites</button></div>
 <p className="muted">Active sites, not a confirmed schedule. Choose where work took place.</p>
 <div className="ember-site-grid">{activeSites.map(p=><button className="ember-site" key={p.id} style={{"--client":clientColor(p.clientId)} as CSSProperties} onClick={()=>{setPlanDate({day:today,nonce:Date.now()});navigate("daily");}}><span className="client-label">{data.clients.find(c=>c.id===p.clientId)?.name}</span><strong>{p.name}</strong><small>Open work records <ArrowUpRight size={14}/></small></button>)}</div>
 {!activeSites.length&&<p className="ember-empty">No active sites yet.</p>}
 </>}
 <div hidden={tab!=="sites"}>
 <div className="ember-chips" aria-label="Site sections">{[["daily","Daily"],["history","History"],["sites","Manage sites"]].map(([id,label])=><button key={id} aria-pressed={section===id} onClick={()=>setSection(id)}>{label}</button>)}</div>
 <div hidden={section!=="daily"}><DailyBoard data={data} today={today} dateRequest={planDate} addresses={Object.fromEntries(management.projects.map(p=>[p.id,p.location||""]))} openSites={()=>navigate("sites")}/></div>
 {tab==="sites"&&section==="history"&&<History data={data}/>}
 {tab==="sites"&&section==="sites"&&<LocationsPanel data={management} isPending={pending} runAction={runManagement}/>}
 </div>
 {tab==="assistant"&&data.finance&&<AssistantChat clients={data.clients} navigate={navigate}/>}
 {tab==="money"&&data.finance&&financeReady&&<>
 <div className="ember-chips" aria-label="Money sections">{[["contractor-invoices","Contractor payments"],["invoices","Client invoices"],["rates","Agreed rates"]].map(([id,label])=><button key={id} aria-pressed={section===id} onClick={()=>setSection(id)}>{label}</button>)}</div>
 {section==="contractor-invoices"&&<InvoiceRegister data={data} snapshot={snapshot} events={invoiceEvents} today={today} sync={macSync}/>}
 {section==="invoices"&&<><ClientDrafts preset={billingPreset} clients={data.clients} today={today} from={data.from} to={data.to}/><details><summary>Historical client records</summary><p className="ember-footnote">Earlier records are retained for reference. Drafts remain labelled as drafts; no payment date has been inferred.</p><ClientInvoiceHistory data={financeManagement}/></details></>}
 {section==="rates"&&<Rates data={data} today={today} pending={pending} run={run}/>}
 </>}
 {tab==="company"&&<>
 <div className="ember-chips" aria-label="Company sections">{(data.finance?[["contacts","Contractors"],["clients","Clients & access"],["documents","Documents"],["work","Work inbox"],["memory","Company memory"],["reviews","Contact reviews"]]:[["sites","Clients & sites"]]).map(([id,label])=><button key={id} aria-pressed={section===id} onClick={()=>setSection(id)}>{label}</button>)}</div>
 {section==="documents"&&data.finance&&<DocumentCatalog data={data} today={today}/>}
 {(section==="work"||section==="memory")&&data.finance&&<CompanyRecords key={section} kind={section==="work"?"work":"memory"} today={today} navigate={navigate}/>}
 {section==="contacts"&&data.finance&&<Contacts data={data} pending={pending} run={run}/>}
 {section==="clients"&&data.finance&&<ClientsAndAccessPanel data={management} isPending={pending} runAction={runManagement}/>}
 {section==="reviews"&&data.finance&&financeReady&&<><h2>{count} contact sources to review</h2><ContactImportReview items={currentContactImports} people={data.contractors} pending={pending} run={run}/></>}
 {!data.finance&&<LocationsPanel data={management} isPending={pending} runAction={runManagement}/>}
 </>}
 </div>
 <nav className="ember-nav office-main-nav" aria-label="Main navigation">{navItems.map(([id,label,Icon])=>{const Glyph=Icon as typeof CalendarDays;return <button key={String(id)} aria-current={tab===id?"page":undefined} className={id==="assistant"?"office-assistant-tab":""} onClick={()=>navigate(id==="sites"?"daily":id==="money"?"contractor-invoices":String(id))}><Glyph size={21}/><span>{String(label)}</span></button>;})}</nav>
 </div></main>;
}