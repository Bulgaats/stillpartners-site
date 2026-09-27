import {addIsoDays} from '../operations/dates';
import {validDate,type OfficeData} from './foundation';
import {invoicePeriod} from './reconciliation';
import type {InvoiceSnapshot} from './invoice-snapshot';
const anchor='2026-09-25';
const millis=(s:string)=>Date.parse(s+'T00:00:00Z');
export function latestPayday(today:string){return addIsoDays(anchor,Math.floor((millis(today)-millis(anchor))/86400000/14)*14);}
export function upcomingPayday(today:string){return addIsoDays(anchor,Math.ceil((millis(today)-millis(anchor))/86400000/14)*14);}
export function payrunPeriod(payday:string){
 if(!validDate(payday))return null;
 // Two complete Monday–Sunday work weeks, paid on the following Friday.
 return {from:addIsoDays(payday,-18),to:addIsoDays(payday,-5)};
}
export function isRegularPayday(day:string){return validDate(day)&&(millis(day)-millis(anchor))%(14*86400000)===0;}
export function invoiceInPayrun(d:InvoiceSnapshot['documents'][number],from:string,to:string){
 const p=invoicePeriod(d.workPeriod);return !!p&&p.from<=to&&p.to>=from;
}
export function contractorForInvoice(d:InvoiceSnapshot['documents'][number],data:OfficeData){
 const norm=(s:string)=>s.trim().replace(/\s+/g,' ').toLocaleLowerCase('en-AU');
 const matches=data.contractors.filter(p=>p.abn.replace(/\s/g,'')===d.abn.replace(/\s/g,'')&&norm(p.fullName)===norm(d.name));
 return matches.length===1?matches[0]:null;
}
export function payrunSummary(data:OfficeData,from:string,to:string){
 const entries=data.entries.filter(e=>e.workDate>=from&&e.workDate<=to);
 const ids=[...new Set(entries.map(e=>e.workerId))];
 return ids.map(id=>{
  const person=data.contractors.find(p=>p.id===id);
  const rows=entries.filter(e=>e.workerId===id).sort((a,b)=>a.workDate.localeCompare(b.workDate)||a.jobId.localeCompare(b.jobId)).map(e=>{
   const site=data.projects.find(p=>p.id===e.jobId);
   return {...e,site:site?.name??'Site unavailable',client:data.clients.find(c=>c.id===site?.clientId)?.name??'Client unavailable'};
  });
  return {id,name:person?.fullName??'Contractor unavailable',abn:person?.abn??'',rows,
   actualHours:Math.round(rows.reduce((n,e)=>n+e.actualHours,0)*100)/100,
   payableHours:rows.some(e=>e.contractorHours===null)?null:Math.round(rows.reduce((n,e)=>n+(e.contractorHours??0),0)*100)/100};
 }).sort((a,b)=>a.name.localeCompare(b.name,'en-AU'));
}
