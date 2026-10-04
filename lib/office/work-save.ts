import {z} from "zod";
import type {createServerSupabaseClient} from "@/lib/supabase/server";
import type {OfficeResult} from "@/app/actions/office";
export const workSchema=z.object({workerId:z.string().uuid(),jobId:z.string().uuid(),workDate:z.string().date(),actualHours:z.number().min(0).max(24),contractorHours:z.number().min(0).max(24).nullable(),clientHours:z.number().min(0).max(24).nullable(),agreementNote:z.string().trim().max(2000).nullable(),expectedUpdatedAt:z.string().nullable()});
export async function saveWork(db:Awaited<ReturnType<typeof createServerSupabaseClient>>,input:z.input<typeof workSchema>):Promise<OfficeResult>{
  const parsed=workSchema.safeParse(input);
  if(!parsed.success)return {ok:false,message:parsed.error.issues[0].message};
  const v=parsed.data;
  const {data:existing,error:readError}=await db.from('work_entries').select('id,hours,updated_at').eq('worker_id',v.workerId).eq('job_id',v.jobId).eq('work_date',v.workDate).maybeSingle();
  if(readError)return {ok:false,message:'Current work record could not be checked. Your draft is retained.'};
  if(existing&&Number(existing.hours)===v.actualHours){
    if(v.contractorHours===null&&v.clientHours===null)return {ok:true,message:'These hours are already saved.'};
    const {data:adjust,error:adjustError}=await db.from('office_work_adjustments').select('contractor_hours,client_hours,agreement_note').eq('work_entry_id',existing.id).maybeSingle();
    if(!adjustError&&Number(adjust?.contractor_hours??existing.hours)===v.contractorHours&&Number(adjust?.client_hours??existing.hours)===v.clientHours&&(adjust?.agreement_note??'')===(v.agreementNote??''))return {ok:true,message:'This work record is already saved; no duplicate was added.'};
  }
  const response=await db.rpc("office_save_work_record",{p_worker:v.workerId,p_job:v.jobId,p_date:v.workDate,p_hours:v.actualHours,p_expected_updated_at:v.expectedUpdatedAt,p_contractor_hours:v.contractorHours,p_client_hours:v.clientHours,p_note:v.agreementNote});
  return response.error?{ok:false,message:response.error.message}:{ok:true,message:"Work record saved."};
}

