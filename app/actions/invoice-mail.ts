'use server';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {getSessionProfile} from '@/lib/auth/session';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {clientDraftSource} from '@/lib/office/client-drafts';
import {getClientPdfBranding} from '@/lib/invoices/client-branding';
import {generateOfficeClientInvoicePdf,generateOfficeWorkSummaryPdf,type OfficeInvoicePdfInput} from '@/lib/invoices/pdf';
import type {InvoiceMail,MailCapability} from '@/lib/office/invoice-mail';
async function access(){const s=await getSessionProfile();if(!s||s.profile.role!=='admin')throw new Error('Finance admin access required');return createServerSupabaseClient();}
const fields='id,invoice_id,recipient,subject,body,content_digest,status,created_at,approved_at,gmail_id,message';
const inputSchema=z.object({id:z.string().uuid(),invoiceId:z.string().uuid(),subject:z.string().trim().min(1).max(200).refine(v=>!/[\r\n]/.test(v)),body:z.string().trim().min(1).max(8000)});
export async function listInvoiceMail(invoiceId:string){const db=await access();if(!z.string().uuid().safeParse(invoiceId).success)throw new Error('Invalid invoice');const rows:InvoiceMail[]=[];for(let start=0;;start+=100){const {data,error}=await db.from('office_invoice_mail').select(fields).eq('invoice_id',invoiceId).order('created_at',{ascending:false}).order('id').range(start,start+99);if(error)throw new Error('Email history unavailable');rows.push(...(data??[]) as InvoiceMail[]);if((data?.length??0)<100)break;}const {data:cap,error}=await db.rpc('office_mail_capability');if(error)throw new Error('Mail connection unavailable');return {mails:rows,capability:(cap??{ready:false}) as MailCapability};}
export async function prepareInvoiceMail(input:z.infer<typeof inputSchema>){
 const db=await access(),parsed=inputSchema.safeParse(input);if(!parsed.success)return {ok:false,message:'Check the subject and message.'};const v=parsed.data;
 const {data:prior,error:priorError}=await db.from('office_invoice_mail').select('invoice_id,subject,body').eq('id',v.id).maybeSingle();if(priorError)return {ok:false,message:'Could not check the saved preview. Retry with the same details.'};if(prior)return prior.invoice_id===v.invoiceId&&prior.subject===v.subject&&prior.body===v.body?{ok:true,message:'Saved preview loaded. Review the exact recipient and both attachments.'}:{ok:false,message:'This request ID already has different details. Refresh and start again.'};
 const {data:d,error}=await db.from('office_client_drafts').select('*').eq('id',v.invoiceId).maybeSingle();if(error||!d||d.status!=='approved'||!d.invoice_number)return {ok:false,message:'Approve the invoice first.'};
 const {data:c,error:ce}=await db.from('clients').select('billing_email,email').eq('id',d.client_id).maybeSingle();const recipient=(c?.billing_email||c?.email||'').trim().toLowerCase();if(ce||!z.string().email().safeParse(recipient).success)return {ok:false,message:'Add the correct client billing email in Clients first.'};
 try{const s=clientDraftSource.parse(d.source);const pdfInput:OfficeInvoicePdfInput={number:d.invoice_number,status:'approved',clientName:s.clientName,clientAbn:s.clientAbn,periodStart:d.period_start,periodEnd:d.period_end,issueDate:d.issue_date,dueDate:d.due_date,subtotalCents:Number(d.subtotal_cents),gstCents:Number(d.gst_cents),totalCents:Number(d.total_cents),gstMode:d.gst_mode,rows:s.rows,branding:await getClientPdfBranding()};
 const attachments=[generateOfficeClientInvoicePdf(pdfInput),generateOfficeWorkSummaryPdf(pdfInput)].map((pdf,i)=>({name:d.invoice_number+(i?'-summary':'')+'.pdf',data:pdf.toString('base64'),sha256:createHash('sha256').update(pdf).digest('hex')}));
 const {error:e}=await db.rpc('office_preview_invoice_mail',{p_id:v.id,p_invoice:d.id,p_invoice_digest:d.source_digest,p_recipient:recipient,p_subject:v.subject,p_body:v.body,p_attachments:attachments});if(e)return {ok:false,message:e.code==='P0001'?e.message:'Email preview could not be saved. Retry with the same details.'};
 return {ok:true,message:'Preview saved. Open both exact PDF attachments and review the recipient and message before approving.'};
 }catch(e){return {ok:false,message:e instanceof Error&&e.message.includes('Unicode PDF font')?e.message:'PDF attachments could not be prepared. Review the invoice details.'};}
}
export async function approveInvoiceMail(id:string,digest:string){const db=await access();const {error}=await db.rpc('office_queue_invoice_mail',{p_id:id,p_digest:digest});return error?{ok:false,message:error.code==='P0001'?error.message:'Approval could not be confirmed. Refresh before retrying.'}:{ok:true,message:'Approved and queued. Your connected Mac sends this exact email when Gmail sending is enabled. Check its status below.'};}
export async function cancelInvoiceMail(id:string){const db=await access();const {error}=await db.rpc('office_cancel_invoice_mail',{p_id:id});return error?{ok:false,message:error.code==='P0001'?error.message:'Cancellation could not be confirmed. Refresh first.'}:{ok:true,message:'Email cancelled. No new send will start for this item.'};}
