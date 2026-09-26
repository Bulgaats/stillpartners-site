'use server';
import {z} from 'zod';
import {getSessionProfile} from '@/lib/auth/session';
import {createServerSupabaseClient} from '@/lib/supabase/server';
async function access(){const session=await getSessionProfile();if(!session||session.profile.role!=='admin')throw new Error('Finance admin access required');return {session,db:await createServerSupabaseClient()};}
export async function latestInvoiceCheck(){const {session,db}=await access();const {data,error}=await db.from('office_assistant_tasks').select('id,status,response,created_at,finished_at').eq('user_id',session.userId).eq('kind','invoice_check').order('created_at',{ascending:false}).limit(1).maybeSingle();if(error)throw new Error('Invoice check status unavailable');return data;}
export async function requestInvoiceCheck(id:string){
 const {session,db}=await access();if(!z.string().uuid().safeParse(id).success)return {ok:false,message:'Invalid request ID.'};
 const {error}=await db.from('office_assistant_tasks').insert({id,user_id:session.userId,kind:'invoice_check',prompt:'Check the latest invoices in work@stillpartners.net and refresh the Office register.',context:{requestedAt:new Date().toISOString()}});
 if(error?.code==='23505')return {ok:true,message:'An invoice check is already queued. It will continue on your Mac.'};
 if(error)return {ok:false,message:'Could not queue the Gmail check. Retry is safe.'};
 return {ok:true,message:'Invoice check queued. Your Mac needs to be awake and online.'};
}
