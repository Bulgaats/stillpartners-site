import 'server-only';
import {gmailToken,gmailGet,mailView,flattenParts,type GmailPart} from './cloud/gmail';
import {z} from 'zod';
export async function searchHostedMail(owner:string,query:string,pageToken=''){
 const q=z.string().trim().min(1).max(1000).parse(query),page=z.string().max(1000).parse(pageToken),t=await gmailToken(owner);
 const list=await gmailGet(t,'messages',{q,maxResults:'20',includeSpamTrash:'true',...(page?{pageToken:page}:{})});
 const items=await Promise.all((list.messages??[]).map(async(m:{id:string})=>{const v=mailView(await gmailGet(t,'messages/'+m.id,{format:'metadata'}));return {id:v.id,from:v.from,to:v.to,subject:v.subject,receivedAt:v.receivedAt,labels:v.labels,source:v.source};}));
 return {items,nextPageToken:String(list.nextPageToken??''),checkedAt:new Date().toISOString()};
}
export async function readHostedMail(owner:string,id:string){const key=z.string().regex(/^[a-f0-9]{1,64}$/i).parse(id);return mailView(await gmailGet(await gmailToken(owner),'messages/'+key,{format:'full'}));}
export async function hostedAttachment(owner:string,id:string,partId:string){
 z.string().regex(/^[a-f0-9]{1,64}$/i).parse(id);z.string().regex(/^[0-9.]{0,40}$/).parse(partId);
 const token=await gmailToken(owner),mail=await gmailGet(token,'messages/'+id,{format:'full'}),part=flattenParts(mail.payload as GmailPart).find(p=>(p.partId??'')===partId);
 if(!part?.body||(!part.filename&&!part.mimeType?.startsWith('image/')))throw new Error('Attachment not found');
 if((part.body.size??0)>8*1024*1024)throw new Error('Open this larger attachment in Gmail');
 const encoded=part.body.data??(part.body.attachmentId?(await gmailGet(token,'messages/'+id+'/attachments/'+encodeURIComponent(part.body.attachmentId))).data:null);
 if(typeof encoded!=='string')throw new Error('Missing attachment');const bytes=Buffer.from(encoded,'base64url');if(bytes.length>8*1024*1024)throw new Error('Open this larger attachment in Gmail');
 return {bytes,mime:part.mimeType??'application/octet-stream',filename:(part.filename||'attachment').replace(/[\r\n"\\/]/g,'_').slice(0,180)};
}
