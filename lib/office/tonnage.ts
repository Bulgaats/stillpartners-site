import {effectiveRate,validDate,type OfficeData} from './foundation';

export const BILLING_HOURS_PER_TONNE=10;
export function sourceTonnes(raw:string):number|null {
 const text=raw.trim().replace(/\s*(?:tonnes?|tons?|t)\s*$/i,'').trim();
 if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,4})?$/.test(text))return null;
 const value=Number(text.replaceAll(',',''));
 return Number.isFinite(value)&&value>0&&value<=1000000?value:null;
}
export function tonnesRateCents(hourlyRateCents:number) {
 if(!Number.isSafeInteger(hourlyRateCents)||hourlyRateCents<=0||hourlyRateCents>10000000)throw new Error('Invalid agreed hourly rate');
 return hourlyRateCents*BILLING_HOURS_PER_TONNE;
}
export function rateTimeline(data:OfficeData,workerId:string,from:string,to:string) {
 if(!validDate(from)||!validDate(to)||from>to)return [];
 return data.entries.filter(e=>e.workerId===workerId&&e.workDate>=from&&e.workDate<=to).sort((a,b)=>a.workDate.localeCompare(b.workDate)||a.id.localeCompare(b.id)).map(e=>{
  const site=data.projects.find(p=>p.id===e.jobId);
  const rate=site?effectiveRate(data.rates,workerId,site.clientId,'contractor',e.workDate):null;
  return {entryId:e.id,workDate:e.workDate,siteId:e.jobId,clientId:site?.clientId??null,payableHours:e.contractorHours,
   billingTonnes:e.contractorHours===null?null:e.contractorHours/BILLING_HOURS_PER_TONNE,
   hourlyRateCents:rate?.hourlyRateCents??null,tonneRateCents:rate?tonnesRateCents(rate.hourlyRateCents):null,
   rateId:rate?.id??null,effectiveFrom:rate?.effectiveFrom??null};
 });
}
