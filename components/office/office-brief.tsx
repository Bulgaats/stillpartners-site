'use client';
import {useCallback,useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {listCompanyRecords} from '@/app/actions/company-records';
import {listOfficeDocuments} from '@/app/actions/documents';
import {listClientDrafts} from '@/app/actions/client-drafts';
import {officeBrief} from '@/lib/office/brief';
import {documentExpiry} from '@/lib/office/documents';
import type {OfficeData} from '@/lib/office/foundation';
import type {InvoiceSnapshot} from '@/lib/office/invoice-snapshot';
import type {InvoiceEvent} from '@/lib/office/invoice-events';
export function OfficeBrief({data,snapshot,events,today,navigate,prepare}:{data:OfficeData;snapshot:InvoiceSnapshot|null;events:InvoiceEvent[];today:string;navigate:(s:string)=>void;prepare:(clientId:string,from:string,to:string)=>void}){
 const router=useRouter();
 const [brief,setBrief]=useState<ReturnType<typeof officeBrief>|null>(null),[notice,setNotice]=useState(''),[pending,setPending]=useState(false);
 const refresh=useCallback(async()=>{setPending(true);try{const [records,docs,drafts]=await Promise.all([listCompanyRecords(),listOfficeDocuments(),listClientDrafts()]);setBrief(officeBrief(data,snapshot,events,drafts,records,docs,today));setNotice('');}catch{setNotice('The office brief could not finish loading. Open the individual sections or try Refresh.');}finally{setPending(false);}},[data,snapshot,events,today]);
 useEffect(()=>{void refresh();},[refresh]);
 return <section className="ember-panel office-brief"><div className="ember-section-heading"><div><p className="eyebrow">BOBBY / OFFICE BRIEF</p><h2>What needs attention</h2></div><button disabled={pending} onClick={()=>{router.refresh();void refresh();}}>{pending?'Checking…':'Refresh'}</button></div><p className="muted">Saved company records · works while your Mac is off.</p>{notice&&<p role="alert">{notice}</p>}{brief&&<>
 <div className="office-home-actions"><button onClick={()=>navigate('contractor-invoices')}><strong>{brief.invoices.filter(i=>i.label==='Matched').length} matched</strong><small>Recorded hours, dated rates and explicit GST</small></button><button onClick={()=>navigate('contractor-invoices')}><strong>{brief.invoices.filter(i=>i.label!=='Matched').length} to check</strong><small>Differences or missing evidence</small></button><button onClick={()=>navigate('invoices')}><strong>{brief.draftCount} client drafts</strong><small>Waiting for your review</small></button><button onClick={()=>navigate('work')}><strong>{brief.work.length} open matters</strong><small>Follow-ups and unfinished work</small></button></div>
 {brief.invoices.length>0&&<details><summary>Invoice checks · {brief.invoices.length}</summary>{brief.invoices.map(i=><article className="ember-person" key={i.id}><strong>{i.name} · {i.invoiceNumber}</strong><p>{i.label}{i.expectedBillingTonnes!==null?` · ${i.expectedBillingTonnes.toFixed(3)} billing tonnes`:''}</p><p>{i.issues[0]??i.message}</p><button className="ember-link" onClick={()=>navigate('contractor-invoices')}>Open contractor invoices →</button></article>)}</details>}
 {brief.billing.length>0&&<><h3>Client billing to prepare</h3>{brief.billing.map(c=><article className="ember-person" key={c.clientId}><strong>{c.name}</strong><p>{c.from} – {c.to} · {c.rows} unreserved work records</p><p>{c.issues.join(' · ')||'Rates available. Confirm that this is the complete billing period.'}</p><button className="ember-primary" onClick={()=>c.issues.some(i=>i.startsWith('Short name'))?navigate('contacts'):c.issues.length?navigate('rates'):prepare(c.clientId,c.from,c.to)}>{c.issues.some(i=>i.startsWith('Short name'))?'Add summary names':c.issues.length?'Complete agreed rates':'Review draft settings'}</button></article>)}</>}
 {brief.documents.map(d=><article className="ember-person" key={d.id}><strong>{d.title}</strong><p>{documentExpiry(d,today).status==='unverified'?'Confirm expiry date':`Expiry ${d.expires_on}`}</p><button className="ember-link" onClick={()=>navigate('documents')}>Open document →</button></article>)}
 {brief.work.slice(0,5).map(w=><article className="ember-person" key={w.id}><strong>{w.title}</strong><p>{w.due_date?`Due ${w.due_date} · `:''}{w.status.replaceAll('_',' ')}</p><p>{w.next_action}</p><button className="ember-link" onClick={()=>navigate('work')}>Open matter →</button></article>)}
 <p className="ember-footnote">Work loaded: {data.from} – {data.to}. Invoice snapshot: {snapshot?.exportedAt?new Date(snapshot.exportedAt).toLocaleString('en-AU',{timeZone:'Australia/Perth'}):'unavailable'}. This is not a live Gmail check or proof that every attendance record is present. Historical settled invoices stay archived.</p>
 </>}</section>;
}
