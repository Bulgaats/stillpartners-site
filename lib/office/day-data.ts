import type {createServerSupabaseClient} from '@/lib/supabase/server';
import type {OfficeEntry} from './foundation';
import type {PlanRead} from './site-plans';
export async function readOfficeDay(db:Awaited<ReturnType<typeof createServerSupabaseClient>>,day:string,finance:boolean){
 const planPromise=db.rpc('office_read_site_plans',{p_from:day,p_to:day,p_due_only:false});
 // Start independent day reads together using the same authenticated client.
 const plansRead=Promise.resolve(planPromise);
 const entries:OfficeEntry[]=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await db.from('work_entries').select('id,worker_id,job_id,work_date,hours,updated_at,approved,locked').eq('work_date',day).order('id').range(offset,offset+499);
  if(error)throw new Error('Work records could not load. Retry before editing.');
  const rows=data??[];
  const adjustments=new Map<string,{contractor_hours:number;client_hours:number;agreement_note:string}>();
  if(finance&&rows.length){
   const r=await db.from('office_work_adjustments').select('work_entry_id,contractor_hours,client_hours,agreement_note').in('work_entry_id',rows.map(e=>e.id));
   if(r.error)throw new Error('Agreed hours could not load. Retry before editing.');
   for(const a of r.data??[])adjustments.set(a.work_entry_id,a);
  }
  entries.push(...rows.map(e=>{const a=adjustments.get(e.id);return {id:e.id,workerId:e.worker_id,jobId:e.job_id,workDate:e.work_date,actualHours:Number(e.hours),contractorHours:finance?Number(a?.contractor_hours??e.hours):null,clientHours:finance?Number(a?.client_hours??e.hours):null,agreementNote:a?.agreement_note??'',locked:!!(e.approved||e.locked),updatedAt:e.updated_at};}));
  if(rows.length<500)break;
 }
 const planResult=await plansRead;if(planResult.error)throw new Error('Site plans could not load.');
 return {day,entries,plans:planResult.data as PlanRead};
}
