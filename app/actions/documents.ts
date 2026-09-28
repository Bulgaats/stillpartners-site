'use server';
import {getSessionProfile} from '@/lib/auth/session';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {documentInput} from '@/lib/office/documents';
import {documentRecords} from '@/lib/office/document-data';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
async function access(){const s=await getSessionProfile();if(!s||s.profile.role!=='admin')throw new Error('Finance admin access required');return createServerSupabaseClient();}
export async function listOfficeDocuments(){await access();return documentRecords();}
export async function saveOfficeDocument(eventId:string,input:unknown){
 const db=await access();z.string().uuid().parse(eventId);const v=documentInput.safeParse(input);
 if(!v.success)return {ok:false,message:v.error.issues[0].message};
 const {error}=await db.rpc('office_save_document',{p_event:eventId,p_document:v.data});
 if(error)return {ok:false,message:error.code==='P0001'?error.message:'Save could not be confirmed. Reload before retrying.'};
 revalidatePath('/office');return {ok:true,message:'Document reference saved. The original file stays at its source.'};
}
export async function officeDocumentHistory(id:string){const db=await access();z.string().uuid().parse(id);const {data,error}=await db.from('office_document_events').select('id,after_data,created_at').eq('document_id',id).order('created_at',{ascending:false}).limit(50);if(error)throw new Error('Document history unavailable');return data??[];}
