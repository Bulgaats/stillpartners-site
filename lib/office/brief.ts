import {effectiveRate,hoursAmountCents,type OfficeData} from './foundation';
import {reconcileInvoice,invoicePeriod,type Reconciliation} from './reconciliation';
import {invoiceState,type InvoiceEvent} from './invoice-events';
import type {InvoiceSnapshot} from './invoice-snapshot';
import type {ClientDraft} from './client-drafts';
import type {CompanyRecord} from './company-records';
import {documentExpiry,type OfficeDocument} from './documents';
export const NEW_WORK_FROM='2026-09-28';
export function officeBrief(data:OfficeData,snapshot:InvoiceSnapshot|null,events:InvoiceEvent[],drafts:ClientDraft[],records:CompanyRecord[],documents:OfficeDocument[],today:string){
 const invoices:(Reconciliation&{id:string;name:string;invoiceNumber:string;label:'Matched'|'Needs review'|'Missing records'})[]=[];
 for(const d of snapshot?.documents??[]){
  if(d.recordType!=='invoice')continue;
  const state=invoiceState(d,snapshot!.sourceDigest,events);if(state.historical||state.status==='Paid')continue;
  const period=invoicePeriod(d.workPeriod);
  // Closed historical sources were handled above. Legacy/unloaded dates need review, not a guessed comparison.
  const r=reconcileInvoice(d,data,snapshot!.documents);
  const missing=!period||period.from<data.from||period.to>data.to||r.issues.some(i=>/No time records|Payable hours need|Agreed contractor rate needed/.test(i));
  invoices.push({...r,id:d.id,name:d.name,invoiceNumber:d.invoiceNumber,label:r.status==='match'?'Matched':missing?'Missing records':'Needs review'});
 }
 const reserved=new Set(drafts.filter(d=>d.status!=='cancelled').flatMap(d=>d.source.rows.map(r=>r.entryId)));
 const billing=data.clients.filter(c=>c.active).flatMap(c=>{
  const rows=data.entries.filter(e=>e.workDate>=NEW_WORK_FROM&&e.workDate<=today&&!e.locked&&!reserved.has(e.id)&&data.projects.some(p=>p.id===e.jobId&&p.clientId===c.id)&&e.clientHours!==0);
  if(!rows.length)return [];
  const issues:string[]=[];let feeCents=0;
  for(const e of rows){if(!data.contractors.find(p=>p.id===e.workerId)?.shortName)issues.push('Short name needed for the client summary');const rate=effectiveRate(data.rates,e.workerId,c.id,'client',e.workDate);if(e.clientHours===null||!rate){issues.push('Missing billable hours or client rate');continue;}try{feeCents+=hoursAmountCents(e.clientHours,rate.hourlyRateCents);}catch{issues.push('Invalid billable hours or client rate');}}
  const days=rows.map(e=>e.workDate).sort();
  return [{clientId:c.id,name:c.name,from:days[0],to:days.at(-1)!,rows:rows.length,feeCents:issues.length?null:feeCents,issues:[...new Set(issues)]}];
 });
 const work=records.filter(r=>r.kind==='work'&&!['completed','cancelled'].includes(r.status)).sort((a,b)=>Number(!!b.due_date&&b.due_date<=today)-Number(!!a.due_date&&a.due_date<=today)||(['urgent','high','normal','low'].indexOf(a.priority)-['urgent','high','normal','low'].indexOf(b.priority)));
 return {invoices,billing,work,documents:documents.filter(d=>['due','expired','unverified'].includes(documentExpiry(d,today).status)),draftCount:drafts.filter(d=>d.status==='draft').length,coverage:{from:data.from,to:data.to,snapshotAt:snapshot?.exportedAt??null,checkedAt:today,liveInbox:false as const}};
}
