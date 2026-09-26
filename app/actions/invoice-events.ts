'use server';
import {z} from 'zod';
import {getSessionProfile} from '@/lib/auth/session';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {revalidatePath} from 'next/cache';
const input=z.object({id:z.string().uuid(),documentId:z.string().min(1).max(2000),kind:z.enum(['approve','payment','void']),digest:z.string().regex(/^[a-f0-9]{64}$/),amount:z.number().int().positive().max(999999999999).nullable(),day:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),reason:z.string().trim().min(3).max(2000),target:z.string().uuid().nullable()});
export async function recordOfficeInvoiceEvent(value:unknown){
 const session=await getSessionProfile();if(!session||session.profile.role!=='admin')return {ok:false,message:'Finance admin access required.'};
 const parsed=input.safeParse(value);if(!parsed.success)return {ok:false,message:'Enter the payment details and confirmation reason.'};
 const p=parsed.data,db=await createServerSupabaseClient();
 const {error}=await db.rpc('office_record_invoice_event',{p_id:p.id,p_document_id:p.documentId,p_kind:p.kind,p_digest:p.digest,p_amount:p.amount,p_day:p.day,p_reason:p.reason,p_target:p.target});
 if(error)return {ok:false,message:error.code==='P0001'?error.message:'Could not confirm this action. Refresh before retrying.'};
 revalidatePath('/office');return {ok:true,message:p.kind==='approve'?'Invoice details approved in Office.':p.kind==='void'?'Office payment cancelled; audit history retained.':'Payment recorded in Office. Mac file synchronization is pending; no bank transfer was made.'};
}
