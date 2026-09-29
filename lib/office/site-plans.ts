import {z} from 'zod';
export const sitePlanInput=z.object({
 eventId:z.string().uuid(),jobId:z.string().uuid(),workDate:z.string().date(),
 reminderTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
 workerIds:z.array(z.string().uuid()).max(100).refine(v=>new Set(v).size===v.length,'Select each person once.'),
 expectedVersion:z.number().int().min(0),note:z.string().trim().max(1000).default('')
}).strict();
export type SitePlanInput=z.infer<typeof sitePlanInput>;
export type PlannedPerson={id:string;fullName:string;shortName:string;active:boolean;entryId:string|null;hours:number|null;otherSites:string[]};
export type SitePlan={id:string;jobId:string;workDate:string;reminderTime:string;version:number;note:string;site:string;address:string;client:string;people:PlannedPerson[];due:boolean;missing:number};
export type PlanRead={plans:SitePlan[];enabled:boolean;checkedAt:string;lastScan:string|null;scanError:string|null};
export function pendingPeople(plan:SitePlan){return plan.people.filter(p=>p.active&&!p.entryId);}
export function planReply(plan:SitePlan){
 const pending=pendingPeople(plan);
 return `${plan.workDate} · ${plan.client} · ${plan.site}${plan.address?' · '+plan.address:''}\n${plan.people.filter(p=>p.active).map(p=>`${p.shortName||p.fullName}: ${p.entryId?`${p.hours}h recorded`:'Hours needed'}${p.otherSites.length?' · Also recorded at '+p.otherSites.join(', '):''}`).join('\n')}\n${pending.length} missing · Reminder ${plan.reminderTime} (Perth). Planned participation is not proof of work.`;
}
