import {NextResponse,type NextRequest} from 'next/server';
import {createHash} from 'node:crypto';
import {getSessionProfile} from '@/lib/auth/session';
import {createServerSupabaseClient} from '@/lib/supabase/server';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const s=await getSessionProfile();if(!s)return NextResponse.json({error:'Sign in required'},{status:401});if(s.profile.role!=='admin')return NextResponse.json({error:'Finance access required'},{status:403});
 const {id}=await params;const db=await createServerSupabaseClient();const {data,error}=await db.from('office_invoice_mail').select('attachments').eq('id',id).maybeSingle();if(error||!data)return NextResponse.json({error:'Email preview not found'},{status:404});
 const ix=request.nextUrl.searchParams.get('summary')==='1'?1:0,a=data.attachments?.[ix];if(!a||typeof a.name!=='string'||!/^[A-Za-z0-9-]+\.pdf$/.test(a.name))return NextResponse.json({error:'Attachment unavailable'},{status:422});
 const bytes=Buffer.from(a.data,'base64');if(createHash('sha256').update(bytes).digest('hex')!==a.sha256)return NextResponse.json({error:'Attachment checksum mismatch'},{status:422});
 return new NextResponse(new Uint8Array(bytes),{headers:{'Content-Type':'application/pdf','Cache-Control':'private, no-store','Content-Disposition':'attachment; filename="'+a.name+'"'}});
}
