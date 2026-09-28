'use server';
import {z} from 'zod';
import {getSessionProfile} from '@/lib/auth/session';
import {gmailToken,gmailGet,mailView} from '@/lib/office/cloud/gmail';
async function token(){const s=await getSessionProfile();if(!s||s.profile.role!=='admin')throw new Error('Finance admin access required');return gmailToken(s.userId);}
export async function searchWorkMail(query:string,pageToken=''){
 const q=z.string().trim().min(1).max(1000).parse(query),page=z.string().max(1000).parse(pageToken),t=await token();
 const list=await gmailGet(t,'messages',{q,maxResults:'20',includeSpamTrash:'true',...(page?{pageToken:page}:{})});
 const items=await Promise.all((list.messages??[]).map(async(m:{id:string})=>{const mail=await gmailGet(t,'messages/'+m.id,{format:'metadata'});const v=mailView(mail);return {id:v.id,from:v.from,to:v.to,subject:v.subject,receivedAt:v.receivedAt,labels:v.labels,source:v.source};}));
 return {items,nextPageToken:String(list.nextPageToken??''),checkedAt:new Date().toISOString()};
}
export async function readWorkMail(id:string){const key=z.string().regex(/^[a-f0-9]{1,64}$/i).parse(id);return mailView(await gmailGet(await token(),'messages/'+key,{format:'full'}));}
