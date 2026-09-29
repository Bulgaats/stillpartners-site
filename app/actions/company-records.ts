'use server';
import {getSessionProfile} from '@/lib/auth/session';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {companyRecords} from '@/lib/office/company-record-data';
import {companyRecordProposal} from '@/lib/office/company-records';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import type {MonitorStatus} from '@/lib/office/company-records';
async function access(){const session=await getSessionProfile();if(!session||session.profile.role!=='admin')throw new Error('Finance admin access required');return createServerSupabaseClient();}
export async function listCompanyRecords(){await access();return companyRecords();}
export async function checkCompanyWork(enabled?:boolean){
 const db=await access();
 if(enabled!==undefined)z.boolean().parse(enabled);
 const {data,error}=await db.rpc('office_monitor_control',{p_enabled:enabled??null,p_scan:true});
 if(error)throw new Error('Company checks could not finish. Existing work items are retained.');
 return data as MonitorStatus;
}
export async function saveCompanyRecord(eventId:string,input:unknown){
 const db=await access();z.string().uuid().parse(eventId);const parsed=companyRecordProposal.safeParse(input);
 if(!parsed.success)return {ok:false,message:parsed.error.issues[0]?.message??'Check the record details.'};
 const {error}=await db.rpc('office_save_company_record',{p_event:eventId,p_record:parsed.data});
 if(error)return {ok:false,message:error.code==='P0001'?error.message:'Could not confirm the save. Refresh before retrying.'};
 revalidatePath('/office');return {ok:true,message:parsed.data.kind==='memory'?'Company memory saved. It is available across chats.':'Work item saved with its next step and history.'};
}
export async function applyCompanyRecordTask(id:string){
 const db=await access();z.string().uuid().parse(id);
 const {error}=await db.rpc('office_save_company_record',{p_event:id,p_record:{},p_task:id});
 if(error)return {ok:false,message:error.code==='P0001'?error.message:'Could not confirm the save. Refresh before retrying.'};
 revalidatePath('/office');return {ok:true,message:'Company record saved. No payment, message or other external action was performed.'};
}
export async function companyRecordHistory(id:string){
 const db=await access();z.string().uuid().parse(id);
 const {data,error}=await db.from('office_company_record_events').select('id,before_data,after_data,created_at').eq('record_id',id).order('created_at',{ascending:false}).limit(50);
 if(error)throw new Error('Could not load history');return data??[];
}

export async function mailAttentionSummary(){
 const db=await access();
 const {data,error,count}=await db.from('office_company_records').select('id,title,priority,updated_at',{count:'exact'}).eq('kind','work').eq('detection->>rule','incoming_mail').not('status','in','(completed,cancelled)').order('updated_at',{ascending:false}).limit(3);
 if(error)throw new Error('Mail work status unavailable');
 return {count:count??0,items:data??[]};
}
