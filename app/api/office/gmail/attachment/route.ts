import {NextRequest,NextResponse} from 'next/server';
import {getSessionProfile} from '@/lib/auth/session';
import {hostedAttachment} from '@/lib/office/hosted-mail';
import {fileHeaders} from '@/lib/office/document-files';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const s=await getSessionProfile();if(!s||s.profile.role!=='admin')return NextResponse.json({error:'Finance admin access required'},{status:403});
 try{const file=await hostedAttachment(s.userId,request.nextUrl.searchParams.get('id')??'',request.nextUrl.searchParams.get('part')??'');
 return new NextResponse(file.bytes,{headers:fileHeaders(file.mime,file.filename,request.nextUrl.searchParams.get('download')==='1')});
 }catch{return NextResponse.json({error:'Attachment could not be read. Check the Gmail connection, or open the original for unsupported or larger files.'},{status:502,headers:{'Cache-Control':'no-store'}});}
}
