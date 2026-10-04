import {z} from 'zod';
import {sitePlanInput} from './site-plans';
import {workSchema,saveWork} from './work-save';
import type {createServerSupabaseClient} from '@/lib/supabase/server';
export const daySaveInput=z.object({day:z.string().date(),plans:z.array(sitePlanInput).max(30),work:z.array(workSchema).max(100)}).strict().superRefine((v,c)=>{
 if(v.plans.some(p=>p.workDate!==v.day)||v.work.some(w=>w.workDate!==v.day))c.addIssue({code:'custom',message:'Save one day at a time.'});
 if(new Set(v.plans.map(p=>p.jobId)).size!==v.plans.length||new Set(v.work.map(w=>w.jobId+':'+w.workerId)).size!==v.work.length)c.addIssue({code:'custom',message:'Each site and work record must appear once.'});
});
export type DaySaveInput=z.infer<typeof daySaveInput>;
// Shared guarded RPCs preserve row locks, source versions, retries and audit history.
// Sequential plans deliberately preserve caller order; a failed plan stops hours.
export async function saveDayChanges(db:Awaited<ReturnType<typeof createServerSupabaseClient>>,input:DaySaveInput){
 const plans:{site:string;ok:boolean;message:string}[]=[],work:{key:string;ok:boolean;message:string}[]=[];
 for(const p of input.plans){
  const {error}=await db.rpc('office_save_site_plan',{p_event:p.eventId,p_plan:p});
  plans.push({site:p.jobId,ok:!error,message:error?error.code==='P0001'?error.message:'Plan save could not be confirmed. Retry safely.':'Plan saved.'});
  if(error)return {plans,work};
 }
 for(let i=0;i<input.work.length;i+=4){
  work.push(...await Promise.all(input.work.slice(i,i+4).map(async v=>{
   const key=`${v.workDate}:${v.jobId}:${v.workerId}`;
   try{return {key,...await saveWork(db,v)};}catch{return {key,ok:false,message:'Save could not be confirmed. Retry safely.'};}
  })));
 }
 return {plans,work};
}
