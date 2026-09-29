import {NextResponse} from 'next/server';
import {createServiceRoleSupabaseClient} from '@/lib/supabase/server';
import {OFFICE_FILE_BUCKET} from '@/lib/office/document-files';
import {z} from 'zod';
import {createHash} from 'node:crypto';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';
 if(token.length<40||token.length>128)return NextResponse.json({error:'Device authentication required'},{status:403});
 const parsed=z.object({id:z.string().uuid()}).strict().safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid registered file'},{status:400});
 const db=createServiceRoleSupabaseClient();if(!db)return NextResponse.json({error:'Unavailable'},{status:503});
 const r=await db.rpc('office_device_document_file',{p_token:token,p_id:parsed.data.id});if(r.error||!r.data)return NextResponse.json({error:'File access unavailable'},{status:403});
 const f=r.data,stored=await db.storage.from(OFFICE_FILE_BUCKET).download(f.object_path);if(stored.error||!stored.data)return NextResponse.json({error:'File unavailable'},{status:502});
 const bytes=Buffer.from(await stored.data.arrayBuffer());if(bytes.length!==f.bytes||createHash('sha256').update(bytes).digest('hex')!==f.sha256)return NextResponse.json({error:'Integrity check failed'},{status:409});
 return NextResponse.json({id:f.id,filename:f.filename,mime:f.mime,sha256:f.sha256,bytes:f.bytes,data:bytes.toString('base64')},{headers:{'Cache-Control':'private, no-store'}});
}
