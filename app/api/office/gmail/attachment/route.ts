import {NextRequest,NextResponse} from 'next/server';
import {getSessionProfile} from '@/lib/auth/session';
import {gmailToken,gmailGet,flattenParts,type GmailPart} from '@/lib/office/cloud/gmail';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const s=await getSessionProfile();if(!s||s.profile.role!=='admin')return NextResponse.json({error:'Finance admin access required'},{status:403});
 const id=request.nextUrl.searchParams.get('id')??'',partId=request.nextUrl.searchParams.get('part')??'';
 if(!/^[a-f0-9]{1,64}$/i.test(id)||!/^\d*(\.\d+)*$/.test(partId)||partId.length>40)return NextResponse.json({error:'Invalid attachment reference'},{status:400});
 try{const token=await gmailToken(s.userId),mail=await gmailGet(token,'messages/'+id,{format:'full'});const part=flattenParts(mail.payload as GmailPart).find(p=>(p.partId??'')===partId);
 if(!part?.body||(!part.filename&&!part.mimeType?.startsWith('image/')))return NextResponse.json({error:'Attachment not found'},{status:404});
 if((part.body.size??0)>8*1024*1024)return NextResponse.json({error:'Open this larger attachment in Gmail.'},{status:413});
 const encoded=part.body.data??(part.body.attachmentId?(await gmailGet(token,'messages/'+id+'/attachments/'+encodeURIComponent(part.body.attachmentId))).data:null);
 if(typeof encoded!=='string')throw new Error('Missing data');const bytes=Buffer.from(encoded,'base64url');if(bytes.length>8*1024*1024)return NextResponse.json({error:'Open this larger attachment in Gmail.'},{status:413});
 const filename=(part.filename||'attachment').replace(/[\r\n"\\/]/g,'_').slice(0,180);
 return new NextResponse(bytes,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return NextResponse.json({error:'Attachment could not be read. Check the Gmail connection or open the original email.'},{status:502,headers:{'Cache-Control':'no-store'}});}
}
