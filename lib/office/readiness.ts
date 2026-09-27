import {effectiveRate,type OfficeData} from './foundation';
import {invoicePeriod} from './reconciliation';
import type {InvoiceSnapshot} from './invoice-snapshot';
export function activeContactImports(data:OfficeData,snapshot:InvoiceSnapshot|null){
 const closed=new Set((snapshot?.documents??[]).filter(d=>d.historicalClosure&&d.historicalClosure.source_hash===d.sourceHash).map(d=>d.id));
 return (data.contactImports??[]).filter(i=>!i.source.documentIds.length||!i.source.documentIds.every(id=>closed.has(id)));
}
export function operationalReadiness(data:OfficeData,snapshot:InvoiceSnapshot|null,day:string){
 const active=data.contractors.filter(p=>p.active);
 const missingRates=active.filter(p=>!data.rates.some(r=>!r.voidedAt&&r.kind==='contractor'&&r.workerId===p.id&&r.clientId===null&&r.effectiveFrom<=day));
 const invoices=(snapshot?.documents??[]).filter(d=>!d.historicalClosure&&d.recordType==='invoice'&&!d.duplicateOf);
 const unknownPeriods=invoices.filter(d=>!invoicePeriod(d.workPeriod));
 const workMissingRates=data.entries.filter(e=>{const p=data.projects.find(p=>p.id===e.jobId);return e.workDate>=day&&(!p||!effectiveRate(data.rates,e.workerId,p.clientId,'contractor',e.workDate)||!effectiveRate(data.rates,e.workerId,p.clientId,'client',e.workDate));});
 return {missingRates,unknownPeriods,workMissingRates};
}
