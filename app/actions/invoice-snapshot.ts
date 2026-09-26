"use server";
import {getSessionProfile} from '@/lib/auth/session';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {invoiceSnapshotSchema} from '@/lib/office/invoice-snapshot';
import {revalidatePath} from 'next/cache';
export async function importOfficeInvoiceSnapshot(content:string){
 const session=await getSessionProfile();if(!session||session.profile.role!=='admin')return {ok:false,message:'Finance admin access required.'};
 if(content.length>900_000)return {ok:false,message:'Snapshot exceeds the import limit.'};
 let raw:unknown;try{raw=JSON.parse(content);}catch{return {ok:false,message:'Select the exported Office_snapshot.json file.'};}
 const parsed=invoiceSnapshotSchema.safeParse(raw);if(!parsed.success)return {ok:false,message:'Snapshot format is invalid. Re-export from the Mac assistant.'};
 const p=parsed.data;const db=await createServerSupabaseClient();
 const {error}=await db.from('office_invoice_snapshots').insert({source_digest:p.sourceDigest,exported_at:p.exportedAt,payload:p,imported_by:session.userId});
 if(error?.code==='23505')return {ok:true,message:'This exact source register has already been imported.'};
 if(error)return {ok:false,message:'Snapshot could not be saved. Previous data is retained.'};
 revalidatePath('/office');return {ok:true,message:`Imported ${p.documents.length} documents. No payment or invoice approval was changed.`};
}
