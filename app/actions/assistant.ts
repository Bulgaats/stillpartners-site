'use server';
import {getSessionProfile} from '@/lib/auth/session';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {officeData} from '@/lib/office/data';
import {getPerthIsoDate,addIsoDays} from '@/lib/operations/dates';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
async function access(){const session=await getSessionProfile();if(!session||session.profile.role!=='admin')throw new Error('Finance admin access required');return {session,db:await createServerSupabaseClient()};}
export async function submitAssistantTask(id:string,prompt:string){
 const {session,db}=await access();if(!z.string().uuid().safeParse(id).success||prompt.trim().length<1||prompt.length>4000)return {ok:false,message:'Enter a request up to 4000 characters.'};
 const {data:existing}=await db.from('office_assistant_tasks').select('id').eq('id',id).maybeSingle();if(existing)return {ok:true,message:'Request already queued.'};
 const {count,error:countError}=await db.from('office_assistant_tasks').select('id',{count:'exact',head:true}).eq('user_id',session.userId).in('status',['queued','running']);if(countError)return {ok:false,message:'Could not check pending requests. Please retry.'};if((count??0)>=3)return {ok:false,message:'Wait for your pending requests to finish.'};
 const today=getPerthIsoDate(),data=await officeData(true,addIsoDays(today,-13),today);
 const {data:history}=await db.from('office_assistant_tasks').select('prompt,response,applied_id').eq('user_id',session.userId).eq('status','done').order('created_at',{ascending:false}).limit(6);
 const {data:snapshot}=await db.from('office_invoice_snapshots').select('exported_at,payload').order('exported_at',{ascending:false}).limit(1).maybeSingle();
 const docs=Array.isArray(snapshot?.payload?.documents)?snapshot.payload.documents:[];
 const context={capturedAt:new Date().toISOString(),today,currency:'AUD',contractors:data.contractors,clients:data.clients,sites:data.projects,workRecords:data.entries,agreedRates:data.rates.filter(r=>!r.voidedAt),workRange:{from:data.from,to:data.to},pendingContactReviews:data.contactImports?.filter(i=>i.status==='pending').length??0,invoiceSnapshot:{exportedAt:snapshot?.exported_at??null,documentCount:docs.length,coverage:'Document count only. No live email check or invoice-level reconciliation has been performed in this conversation.'},conversation:(history??[]).reverse()};
 const {error}=await db.from('office_assistant_tasks').insert({id,user_id:session.userId,prompt:prompt.trim(),context});if(error?.code==='23505')return {ok:true,message:'Request already queued.'};if(error)return {ok:false,message:'Could not queue your request.'};return {ok:true,message:'Request queued for your Mac assistant.'};
}
export async function listAssistantTasks(){const {session,db}=await access();const {data,error}=await db.from('office_assistant_tasks').select('id,prompt,status,response,created_at,applied_id').eq('user_id',session.userId).order('created_at',{ascending:false}).limit(20);if(error)throw new Error('Could not load conversation');return (data??[]).reverse();}
export async function applyAssistantTask(id:string){const {db}=await access();const {error}=await db.rpc('office_apply_assistant_task',{p_id:id});if(error)return {ok:false,message:error.code==='P0001'?error.message:'Could not save the proposed record. No success was confirmed.'};revalidatePath('/office');return {ok:true,message:'Record created. Your company directory is updated.'};}
