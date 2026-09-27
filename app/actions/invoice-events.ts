'use server';
import {z} from 'zod';
import {validDate} from '@/lib/office/foundation';
import {getPerthIsoDate} from '@/lib/operations/dates';
import {invoiceSnapshotSchema} from '@/lib/office/invoice-snapshot';
import {invoiceState,type InvoiceEvent} from '@/lib/office/invoice-events';
import {paymentSourceIssues} from '@/lib/office/payment-readiness';
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

const paidInput=z.object({
 id:z.string().uuid(),reviewId:z.string().uuid(),documentId:z.string().min(1).max(2000),
 digest:z.string().regex(/^[a-f0-9]{64}$/),amount:z.number().int().positive().max(999999999999),
 day:z.string().refine(validDate),expectedPaid:z.number().int().min(0),
 reference:z.string().trim().max(500).default(''),reviewNote:z.string().trim().max(1000).default('')
});
export async function markOfficeInvoicePaid(value:unknown){
 const session=await getSessionProfile();
 if(!session||session.profile.role!=='admin')return {ok:false,message:'Finance admin access required.'};
 const parsed=paidInput.safeParse(value);
 if(!parsed.success)return {ok:false,message:'Check the payment amount and date.'};
 const p=parsed.data;
 if(p.day>getPerthIsoDate())return {ok:false,message:'Use the actual transfer date, not a future payday.'};
 const db=await createServerSupabaseClient();
 const reason=`Owner marked Paid: AUD ${(p.amount/100).toFixed(2)} on ${p.day}.`+(p.reference?' Reference: '+p.reference:'')+(p.reviewNote?' Comment: '+p.reviewNote:'');
 // Confirmed response receipt only; an empty creation timestamp stays unknown until refresh.
 const payment:InvoiceEvent={id:p.id,document_id:p.documentId,kind:'payment',source_digest:p.digest,amount_cents:p.amount,payment_date:p.day,reason,target_id:null,created_at:''};
 // Reconcile an uncertain response before running freshness checks.
 const {data:prior,error:priorError}=await db.from('office_invoice_events').select('*').eq('id',p.id).maybeSingle();
 if(priorError)return {ok:false,message:'Payment history unavailable. Retry with the same details.'};
 if(prior){
  if(prior.created_by===session.userId&&prior.kind==='payment'&&prior.document_id===p.documentId&&prior.source_digest===p.digest&&prior.amount_cents===p.amount&&prior.payment_date===p.day&&prior.reason===reason)
   return {ok:true,message:'This payment was already recorded. No duplicate was added.',payment:{...payment,created_at:prior.created_at??''}};
  return {ok:false,message:'This action ID belongs to different payment details. Refresh first.'};
 }
 const {data:saved,error}=await db.from('office_invoice_snapshots').select('payload').order('exported_at',{ascending:false}).limit(1).maybeSingle();
 const parsedSnapshot=invoiceSnapshotSchema.safeParse(saved?.payload);
 if(error||!parsedSnapshot.success)return {ok:false,message:'Invoice register unavailable. Refresh first.'};
 const snapshot=parsedSnapshot.data,d=snapshot.documents.find(x=>x.id===p.documentId);
 if(!d||snapshot.sourceDigest!==p.digest)return {ok:false,message:'Invoice register changed. Refresh and check the current invoice.'};
 const events:InvoiceEvent[]=[];
 for(let offset=0;;offset+=500){
  const page=await db.from('office_invoice_events').select('*').eq('document_id',d.id).order('id').range(offset,offset+499);
  if(page.error)return {ok:false,message:'Payment history unavailable. No payment recorded.'};
  events.push(...(page.data??[]) as InvoiceEvent[]);
  if((page.data?.length??0)<500)break;
 }
 const state=invoiceState(d,p.digest,events);
 if(state.paid!==p.expectedPaid)return {ok:false,message:'Payment balance changed. Refresh before recording another payment.'};
 const sourceIssues=paymentSourceIssues(d);
 if(sourceIssues.length)return {ok:false,message:sourceIssues.join(' ')};
 // Paid is the owner's approval and transfer confirmation. Viewing Review and adding
 // comments are optional; do not claim that checks matched or were opened.
 const reviewReason='Owner approved this invoice by pressing Paid and confirmed the recorded transfer.'+
  (p.reviewNote?' Comment: '+p.reviewNote:'');
 const {error:saveError}=await db.rpc('office_mark_invoice_paid',{
  p_id:p.id,p_review_id:p.reviewId,p_document_id:d.id,p_digest:p.digest,p_amount:p.amount,p_day:p.day,
  p_reason:reason,p_review_reason:reviewReason,p_expected_paid:p.expectedPaid
 });
 if(saveError)return {ok:false,message:saveError.code==='P0001'?saveError.message:'Could not confirm. Retry with the same details; do not create a second payment.'};
 revalidatePath('/office');return {ok:true,message:'Payment recorded. Mac filing will follow when connected.',payment};
}
