import {NextResponse,type NextRequest} from 'next/server';
import {getSessionProfile} from '@/lib/auth/session';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {clientDraftSource} from '@/lib/office/client-drafts';
import {getClientPdfBranding} from '@/lib/invoices/client-branding';
import {generateOfficeClientInvoicePdf,generateOfficeWorkSummaryPdf,type OfficeInvoicePdfInput} from '@/lib/invoices/pdf';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const session=await getSessionProfile();if(!session)return NextResponse.json({error:'Sign in required'},{status:401});if(session.profile.role!=='admin')return NextResponse.json({error:'Finance admin access required'},{status:403});
 const {id}=await params;const db=await createServerSupabaseClient();const {data:d,error}=await db.from('office_client_drafts').select('*').eq('id',id).maybeSingle();if(error||!d)return NextResponse.json({error:'Invoice draft not found'},{status:404});
 const parsed=clientDraftSource.safeParse(d.source);if(!parsed.success)return NextResponse.json({error:'Invoice snapshot needs review'},{status:422});
 const s=parsed.data,number=d.invoice_number??`Draft-${d.id.slice(0,8)}`,summary=request.nextUrl.searchParams.get('summary')==='1';
 const input:OfficeInvoicePdfInput={number,status:d.status,clientName:s.clientName,clientAbn:s.clientAbn,periodStart:d.period_start,periodEnd:d.period_end,issueDate:d.issue_date,dueDate:d.due_date,subtotalCents:Number(d.subtotal_cents),gstCents:Number(d.gst_cents),totalCents:Number(d.total_cents),gstMode:d.gst_mode,rows:s.rows,branding:await getClientPdfBranding()};
 try{const pdf=summary?generateOfficeWorkSummaryPdf(input):generateOfficeClientInvoicePdf(input);return new NextResponse(new Uint8Array(pdf),{headers:{'Content-Type':'application/pdf','Cache-Control':'private, no-store','Content-Disposition':`attachment; filename="${number.replace(/[^a-zA-Z0-9-]/g,'-')}${summary?'-summary':''}.pdf"`}});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'PDF could not be created'},{status:422});}
}
