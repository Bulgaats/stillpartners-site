import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {getSessionProfile} from '@/lib/auth/session';
import {createServerSupabaseClient,createServiceRoleSupabaseClient} from '@/lib/supabase/server';
import {OFFICE_FILE_LIMIT,OFFICE_FILE_BUCKET,inspectOfficeFile,fileHeaders} from '@/lib/office/document-files';
import {createHash} from 'node:crypto';
export const dynamic='force-dynamic';
export const maxDuration=60;
const uuid=z.string().uuid();
export async function POST(request:NextRequest){
 if(request.headers.get('origin')!==request.nextUrl.origin)return NextResponse.json({error:'Invalid origin'},{status:403});
 const s=await getSessionProfile();if(!s||s.profile.role!=='admin')return NextResponse.json({error:'Finance admin required'},{status:403});
 if(Number(request.headers.get('content-length')??0)>OFFICE_FILE_LIMIT+30000)return NextResponse.json({error:'Use a file up to 3 MB or save its Gmail source link.'},{status:413});
 try{
  const form=await request.formData(),id=uuid.parse(form.get('id')),documentId=uuid.parse(form.get('documentId')),file=form.get('file');
  if(!(file instanceof File)||file.size>OFFICE_FILE_LIMIT)return NextResponse.json({error:'Use a file up to 3 MB or save its Gmail source link.'},{status:413});
  const bytes=Buffer.from(await file.arrayBuffer()),info=inspectOfficeFile(bytes,file.name,file.type),db=createServiceRoleSupabaseClient();if(!db)throw new Error('Server unavailable');
  const reservation=await db.rpc('office_document_file_exchange',{p_owner:s.userId,p_request:{action:'reserve',id,documentId,...info}});
  if(reservation.error)return NextResponse.json({error:reservation.error.code==='P0001'?reservation.error.message:'Could not reserve document upload.'},{status:409});
  const f=reservation.data;
  if(f.status!=='ready'){
   const result=await db.storage.from(OFFICE_FILE_BUCKET).upload(f.object_path,bytes,{contentType:info.mime,upsert:false});
   if(result.error){
    // Recover an upload which completed before the previous response was lost.
    const existing=await db.storage.from(OFFICE_FILE_BUCKET).download(f.object_path);
    if(existing.error||!existing.data||createHash('sha256').update(Buffer.from(await existing.data.arrayBuffer())).digest('hex')!==info.sha256)throw new Error('Upload not verified');
   }
   const done=await db.rpc('office_document_file_exchange',{p_owner:s.userId,p_request:{action:'complete',id:f.id,sha256:info.sha256}});if(done.error)throw new Error('Upload confirmation pending');
  }
  return NextResponse.json({ok:true,id:f.id,message:'Private copy saved. The original is unchanged.'});
 }catch(e){return NextResponse.json({error:e instanceof z.ZodError?'Invalid document reference.':e instanceof Error&&/Use a/.test(e.message)?e.message:'Upload was not confirmed. Keep the file and retry; existing documents are preserved.'},{status:400});}
}
export async function GET(request:NextRequest){
 const s=await getSessionProfile();if(!s||s.profile.role!=='admin')return NextResponse.json({error:'Finance admin required'},{status:403});
 const id=uuid.safeParse(request.nextUrl.searchParams.get('id'));if(!id.success)return NextResponse.json({error:'Invalid file reference'},{status:400});
 const db=await createServerSupabaseClient(),r=await db.from('office_document_files').select('*').eq('id',id.data).eq('status','ready').maybeSingle();
 if(r.error||!r.data)return NextResponse.json({error:'File unavailable'},{status:404});
 const stored=await db.storage.from(OFFICE_FILE_BUCKET).download(r.data.object_path);if(stored.error||!stored.data)return NextResponse.json({error:'File could not be loaded'},{status:502});
 const bytes=Buffer.from(await stored.data.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==r.data.sha256)return NextResponse.json({error:'File integrity check failed'},{status:409});
 return new NextResponse(bytes,{headers:fileHeaders(r.data.mime,r.data.filename,request.nextUrl.searchParams.get('download')==='1')});
}
