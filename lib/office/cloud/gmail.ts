import {createServiceRoleSupabaseClient} from '@/lib/supabase/server';
import {unseal} from './crypto';
import {gmailConfig} from './config';
export const READ_SCOPE='https://www.googleapis.com/auth/gmail.readonly';
export async function gmailToken(owner:string){
 const db=createServiceRoleSupabaseClient();if(!db||!gmailConfig().ready)throw new Error('Gmail cloud connection is not configured');
 const {data,error}=await db.from('office_cloud_mailboxes').select('encrypted_token').eq('owner_id',owner).maybeSingle();
 if(error||!data)throw new Error('Connect Gmail in Cloud connections before checking live mail');
 const token=unseal(data.encrypted_token,owner);
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.OFFICE_GOOGLE_CLIENT_ID!,client_secret:process.env.OFFICE_GOOGLE_CLIENT_SECRET!,refresh_token:token.refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000),cache:'no-store'});
 if(!r.ok)throw new Error('Gmail access expired or was revoked. Reconnect Gmail.');
 const body=await r.json();if(typeof body.access_token!=='string')throw new Error('Gmail token unavailable');return body.access_token as string;
}
export async function gmailGet(token:string,path:string,params:Record<string,string>={}){
 const url=new URL('https://gmail.googleapis.com/gmail/v1/users/me/'+path);Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));
 const response=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000),cache:'no-store'});
 if(!response.ok)throw new Error('Gmail could not complete the read (HTTP '+response.status+')');
 return response.json();
}
export type GmailPart={partId?:string;filename?:string;mimeType?:string;headers?:{name:string;value:string}[];body?:{data?:string;size?:number;attachmentId?:string};parts?:GmailPart[]};
export function flattenParts(part:GmailPart):GmailPart[]{return [part,...(part.parts??[]).flatMap(flattenParts)];}
export function mailView(mail:{id:string;threadId:string;internalDate:string;labelIds?:string[];payload:GmailPart}){
 const parts=flattenParts(mail.payload),headers=mail.payload.headers??[];
 const value=(name:string)=>headers.find(h=>h.name.toLowerCase()===name)?.value??'';
 const texts=parts.filter(p=>p.mimeType==='text/plain'&&!p.filename&&p.body?.data).map(p=>Buffer.from(p.body!.data!,'base64url').toString('utf8'));
 const html=parts.filter(p=>p.mimeType==='text/html'&&!p.filename&&p.body?.data).map(p=>Buffer.from(p.body!.data!,'base64url').toString('utf8'));
 const body=(texts.length?texts:html).join('\n');
 return {id:mail.id,threadId:mail.threadId,receivedAt:new Date(Number(mail.internalDate)).toISOString(),from:value('from'),to:value('to'),subject:value('subject'),labels:mail.labelIds??[],source:'https://mail.google.com/mail/u/work@stillpartners.net/#all/'+mail.id,body:body.slice(0,40000),bodyTruncated:body.length>40000,bodyFormat:texts.length?'plain':'html',attachments:parts.filter(p=>p.filename||p.body?.attachmentId||p.mimeType?.startsWith('image/')).map(p=>({partId:p.partId??'',filename:p.filename??'',mimeType:p.mimeType??'',bytes:p.body?.size??0,read:false})),coverage:'Body and attachment manifest only. Attachments and inline images are unread until read_gmail_attachment succeeds.'};
}
