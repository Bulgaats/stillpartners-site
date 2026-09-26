import {effectiveRate,hoursAmountCents,validAbn,validDate,type OfficeData} from './foundation';
import type {InvoiceSnapshot} from './invoice-snapshot';
type Doc=InvoiceSnapshot['documents'][number];
const norm=(s:string)=>s.trim().replace(/\s+/g,' ').toLocaleLowerCase('en-AU');
const abn=(s:string)=>s.replace(/\s/g,'');
export function invoicePeriod(raw:string):{from:string;to:string}|null{
 const text=raw.trim();const iso=text.match(/^(\d{4}-\d{2}-\d{2})\s*(?:to|[-–—])\s*(\d{4}-\d{2}-\d{2})$/i);const au=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(?:to|[-–—])\s*(\d{1,2})\/(\d{1,2})\/(\d{4})$/i);
 const from=iso?.[1]??(au?`${au[3]}-${au[2].padStart(2,'0')}-${au[1].padStart(2,'0')}`:text);const to=iso?.[2]??(au?`${au[6]}-${au[5].padStart(2,'0')}-${au[4].padStart(2,'0')}`:text);
 if(!validDate(from)||!validDate(to)||from>to)return null;return {from,to};
}
function gstCents(raw:string):number|null{
 const v=raw.trim().replace(/^\$\s*/,'');if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(v))return null;
 const value=Number(v.replaceAll(',',''));return Number.isFinite(value)&&value>=0?Math.round(value*100):null;
}
export type Reconciliation={status:'match'|'difference'|'review';message:string;expectedFeeCents:number|null;expectedTotalCents:number|null;differenceCents:number|null;actualHours:number|null;payableHours:number|null;rows:number;period:{from:string;to:string}|null;issues:string[]};
export function reconcileInvoice(d:Doc,data:OfficeData,all:Doc[]):Reconciliation{
 const result:Reconciliation={status:'review',message:'Review required',expectedFeeCents:null,expectedTotalCents:null,differenceCents:null,actualHours:null,payableHours:null,rows:0,period:invoicePeriod(d.workPeriod),issues:[]};
 const issue=(text:string)=>{result.issues.push(text);return result;};
 if(d.recordType!=='invoice'||d.currency!=='AUD'||d.amountCents===null||d.amountCents<=0||d.duplicateOf)return issue('Only a positive AUD contractor invoice with no duplicate link can be compared.');
 if(!validAbn(d.abn)||abn(d.abn)==='62687072420')return issue('Supplier ABN requires review.');
 const matches=data.contractors.filter(p=>abn(p.abn)===abn(d.abn)&&norm(p.fullName)===norm(d.name));if(matches.length!==1)return issue('Link one contractor with the same full name and supplier ABN before comparing.');
 const period=result.period;if(!period)return issue('A valid work period is required; invoice or received dates are not substituted.');
 if(period.from<data.from||period.to>data.to)return issue('Load this work period in Office to compare its time records.');
 if(all.some(x=>x.id!==d.id&&x.recordType==='invoice'&&!x.duplicateOf&&abn(x.abn)===abn(d.abn)&&norm(x.name)!==norm(d.name)))result.issues.push('This supplier ABN appears under another name; resolve the identity conflict.');
 if(all.some(x=>{if(x.id===d.id||x.recordType!=='invoice'||x.duplicateOf||abn(x.abn)!==abn(d.abn)||norm(x.name)!==norm(d.name))return false;const p=invoicePeriod(x.workPeriod);return p&&p.from<=period.to&&p.to>=period.from;}))result.issues.push('Another invoice overlaps this work period. Check revisions or split invoices before payment.');
 const entries=data.entries.filter(e=>e.workerId===matches[0].id&&e.workDate>=period.from&&e.workDate<=period.to);result.rows=entries.length;if(!entries.length)return issue('No time records found for this contractor and period. Missing records do not mean zero work.');
 result.actualHours=0;result.payableHours=0;let expected=0,missing=false;
 for(const e of entries){const project=data.projects.find(p=>p.id===e.jobId);const rate=project?effectiveRate(data.rates,e.workerId,project.clientId,'contractor',e.workDate):null;const hours=e.contractorHours;
  result.actualHours+=e.actualHours;if(hours===null){missing=true;result.issues.push(`Payable hours need confirmation on ${e.workDate}.`);continue;}result.payableHours+=hours;
  if(hours>0&&!rate){missing=true;result.issues.push(`Agreed contractor rate needed on ${e.workDate}.`);continue;}try{if(hours>0)expected+=hoursAmountCents(hours,rate!.hourlyRateCents);}catch{missing=true;result.issues.push(`Invalid hours or rate on ${e.workDate}.`);}
 }
 result.actualHours=Math.round(result.actualHours*100)/100;result.payableHours=Math.round(result.payableHours*100)/100;
 if(missing){result.issues=[...new Set(result.issues)];return result;}result.expectedFeeCents=expected;
 const gst=gstCents(d.gst);if(gst===null)return issue('GST amount is not explicit on the imported source. Do not assume it is zero.');
 if(gst>d.amountCents)return issue('GST exceeds the invoice total.');
 if(gst!==0&&gst!==Math.round(expected/10))result.issues.push('Source GST does not equal 10% of the recorded fee; review the GST basis.');
 result.expectedTotalCents=expected+gst;result.differenceCents=d.amountCents-result.expectedTotalCents;
 if(d.flags.length)result.issues.push('Source document flags still need review.');
 if(result.issues.length)return result;
 result.status=result.differenceCents===0?'match':'difference';result.message=result.status==='match'?'Amount matches the recorded payable hours and agreed rates.':'Invoice total differs from the recorded calculation.';return result;
}
