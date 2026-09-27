import {z} from 'zod';
const isoDate=z.string().refine(v=>v===''||(/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v),'Use a valid date');
export const companyRecordProposal=z.object({
 id:z.string().uuid().or(z.literal('')),expectedVersion:z.number().int().min(0),kind:z.enum(['memory','work']),
 title:z.string().min(2).max(160),body:z.string().max(4000),status:z.enum(['confirmed','superseded','open','waiting_external','waiting_mac','needs_review','completed','cancelled']),
 category:z.enum(['','decision','agreement','preference','rule']),priority:z.enum(['low','normal','high','urgent']),
 dueDate:isoDate,effectiveDate:isoDate,nextAction:z.string().max(1000),outcome:z.string().max(2000),sourceRef:z.string().max(500)
}).strict().superRefine((r,ctx)=>{
 const issue=(message:string)=>ctx.addIssue({code:z.ZodIssueCode.custom,message});
 if(r.kind==='memory'&&(!['confirmed','superseded'].includes(r.status)||!r.category||r.body.trim().length<3))issue('Memory needs its category, details and confirmation status.');
 if(r.kind==='work'){
  if(['confirmed','superseded'].includes(r.status))issue('Choose a work status.');
  if(['completed','cancelled'].includes(r.status)){if(!r.id||r.outcome.trim().length<3)issue('An existing work item needs an outcome before it can close.');}
  else if(r.nextAction.trim().length<3)issue('Enter the next action or waiting reason.');
 }
});
export type CompanyRecordProposal=z.infer<typeof companyRecordProposal>;
export type CompanyRecord={id:string;kind:'memory'|'work';title:string;body:string;status:CompanyRecordProposal['status'];category:CompanyRecordProposal['category'];priority:CompanyRecordProposal['priority'];due_date:string|null;effective_date:string|null;next_action:string;outcome:string;source_ref:string;version:number;created_at:string;updated_at:string;detection?:{rule:string;active:boolean;observedAt:string;summary:string;evidence:Record<string,unknown>}|null};
export type MonitorStatus={enabled:boolean;work_from:string;last_checked_at:string|null;last_error:string|null;last_result:{activeConditions?:number;snapshotAvailable?:boolean;created?:number;updated?:number;cleared?:number}};
export function recordDraft(kind:'memory'|'work',r?:CompanyRecord):CompanyRecordProposal{return r?{id:r.id,expectedVersion:r.version,kind:r.kind,title:r.title,body:r.body,status:r.status,category:r.category,priority:r.priority,dueDate:r.due_date??'',effectiveDate:r.effective_date??'',nextAction:r.next_action,outcome:r.outcome,sourceRef:r.source_ref}:{id:'',expectedVersion:0,kind,title:'',body:'',status:kind==='memory'?'confirmed':'open',category:kind==='memory'?'decision':'',priority:'normal',dueDate:'',effectiveDate:'',nextAction:'',outcome:'',sourceRef:''};}
