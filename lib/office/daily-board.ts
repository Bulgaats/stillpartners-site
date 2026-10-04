import type {OfficeEntry} from './foundation';
import type {SitePlan} from './site-plans';
import type {WorkDraft} from './work-drafts';

export const dailyKey=(day:string,site:string,person:string)=>`${day}:${site}:${person}`;
export function dailyDraft(e?:OfficeEntry):WorkDraft{
 return {actual:e?String(e.actualHours):'',pay:e?String(e.contractorHours??e.actualHours):'',bill:e?String(e.clientHours??e.actualHours):'',note:e?.agreementNote??'',adjust:!!e&&(e.contractorHours!==null&&e.contractorHours!==e.actualHours||e.clientHours!==null&&e.clientHours!==e.actualHours),dirty:false,expectedUpdatedAt:e?.updatedAt??null};
}
export function dayTeams(plans:SitePlan[],entries:OfficeEntry[],edits:Record<string,string[]>){
 const teams:Record<string,string[]>={};
 for(const p of plans)teams[p.jobId]=p.people.filter(v=>v.active).map(v=>v.id);
 for(const [site,ids] of Object.entries(edits))teams[site]=[...ids];
 for(const e of entries)teams[e.jobId]=Array.from(new Set([...(teams[e.jobId]??[]),e.workerId]));
 return teams;
}
export function availableForSite(person:string,site:string,teams:Record<string,string[]>){
 return !Object.entries(teams).some(([,ids])=>ids.includes(person));
}
export function draftError(r:WorkDraft,finance:boolean){
 const valid=(s:string)=>/^\d+(\.\d{1,2})?$/.test(s)&&Number(s)<=24;
 if(!valid(r.actual))return 'Enter hours from 0 to 24, up to 2 decimals.';
 if(finance&&(!valid(r.pay)||!valid(r.bill)))return 'Check payable and client hours.';
 if(finance&&(Number(r.pay)!==Number(r.actual)||Number(r.bill)!==Number(r.actual))&&r.note.trim().length<3)return 'Add the agreement for different hours.';
 return '';
}
