'use server';
import {z} from 'zod';
import {getSessionProfile} from '@/lib/auth/session';
import {canAccessOperations} from '@/lib/auth/roles';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {readSitePlans} from '@/lib/office/site-plan-data';
import type {OfficeEntry} from '@/lib/office/foundation';

// Load only the selected day; never trust finance visibility supplied by the browser.
export async function loadOfficeDay(day:string){
 z.string().date().parse(day);
 const session=await getSessionProfile();
 if(!session||!canAccessOperations(session.profile.role))throw new Error('Operations access required');
 const db=await createServerSupabaseClient(),finance=session.profile.role==='admin';

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
 return {day,entries,plans:await readSitePlans(day,day)};
}
