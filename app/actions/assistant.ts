'use server';
import {getSessionProfile} from '@/lib/auth/session';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {companyRecords} from '@/lib/office/company-record-data';
import {officeData} from '@/lib/office/data';
import {getPerthIsoDate,addIsoDays} from '@/lib/operations/dates';
import {z} from 'zod';
import {cloudConfig} from '@/lib/office/cloud/config';
import {revalidatePath} from 'next/cache';
async function access(){const session=await getSessionProfile();if(!session||session.profile.role!=='admin')throw new Error('Finance admin access required');return {session,db:await createServerSupabaseClient()};}
const uuid=z.string().uuid();
export async function submitAssistantTask(id:string,prompt:string,conversationId?:string){
 const {session,db}=await access();
 if(!uuid.safeParse(id).success||(conversationId&&!uuid.safeParse(conversationId).success)||prompt.trim().length<1||prompt.length>4000)return {ok:false,message:'Enter a request up to 4000 characters.'};
 const {data:existing,error:existingError}=await db.from('office_assistant_tasks').select('id').eq('id',id).eq('user_id',session.userId).maybeSingle();
 if(existingError)return {ok:false,message:'Could not check this request. Please retry.'};
 if(existing)return {ok:true,message:'Request already queued.'};
 const {data:active,error:countError}=await db.from('office_assistant_tasks').select('id,conversation_id').eq('user_id',session.userId).in('status',['queued','running']);
 if(countError)return {ok:false,message:'Could not check pending requests. Please retry.'};
 if(conversationId&&(active??[]).some(t=>t.conversation_id===conversationId))return {ok:false,message:'Let the current reply finish, or start a new chat for a separate task.'};
 if(conversationId){
  const {error}=await db.from('office_assistant_conversations').upsert({id:conversationId,user_id:session.userId,title:prompt.trim().replace(/\s+/g,' ').slice(0,120)},{onConflict:'id',ignoreDuplicates:true});
  if(error)return {ok:false,message:'Could not open this conversation. Please retry.'};
  const {data:conversation}=await db.from('office_assistant_conversations').select('id').eq('id',conversationId).eq('user_id',session.userId).maybeSingle();
  if(!conversation)return {ok:false,message:'Conversation unavailable. Start a new chat.'};
 }
 const today=getPerthIsoDate(),data=await officeData(true,addIsoDays(today,-89),today);
 let historyQuery=db.from('office_assistant_tasks').select('prompt,response,applied_id,applications:office_assistant_applications(proposal_index,worker_id,status,message)').eq('user_id',session.userId).eq('status','done');
 historyQuery=conversationId?historyQuery.eq('conversation_id',conversationId):historyQuery.is('conversation_id',null);
 const {data:history,error:historyError}=await historyQuery.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(6);
 if(historyError)return {ok:false,message:'Could not load this chat’s context. Please retry.'};
 const {data:snapshot}=await db.from('office_invoice_snapshots').select('exported_at,payload').order('exported_at',{ascending:false}).limit(1).maybeSingle();
 const docs=Array.isArray(snapshot?.payload?.documents)?snapshot.payload.documents:[];
 const records=await companyRecords();
 const context={companyMemory:records.filter(r=>r.kind==='memory'),workItems:records.filter(r=>r.kind==='work'),capturedAt:new Date().toISOString(),today,currency:'AUD',contractors:data.contractors,clients:data.clients,sites:data.projects,workRecords:data.entries,agreedRates:data.rates.filter(r=>!r.voidedAt),workRange:{from:data.from,to:data.to},pendingContactReviews:data.contactImports?.filter(i=>i.status==='pending').length??0,contactReviews:(data.contactImports??[]).map(i=>({id:i.id,status:i.status,workerId:i.workerId,name:i.source.name,abn:i.source.abn,emails:i.source.emails,phones:i.source.phones,issues:i.source.issues,documentCount:i.source.documentCount})),invoiceSnapshot:{exportedAt:snapshot?.exported_at??null,documentCount:docs.length,coverage:'Full imported invoice metadata and verified local source text are available through the Mac company-record tools. Use them before asking the owner for data. This snapshot is not a live inbox check.'},conversation:(history??[]).reverse()};
 const {error}=await db.from('office_assistant_tasks').insert({id,user_id:session.userId,conversation_id:conversationId??null,prompt:prompt.trim(),context,executor:cloudConfig().enabled?'cloud':'mac'});
 if(error?.code==='23505')return {ok:true,message:'Request already queued.'};
 if(error)return {ok:false,message:'Could not queue your request.'};
 return {ok:true,message:cloudConfig().enabled?'Request queued for Bobby in the cloud.':'Request queued for your Mac assistant.'};
}
export async function listAssistantConversations(limit=30){
 const {session,db}=await access();
 const size=z.number().int().min(1).max(500).parse(limit);
 const {data,error}=await db.from('office_assistant_conversations').select('id,title,created_at,updated_at').eq('user_id',session.userId).order('updated_at',{ascending:false}).order('id').limit(size+1);
 const {data:active,error:activeError}=await db.from('office_assistant_tasks').select('conversation_id,status').eq('user_id',session.userId).in('status',['queued','running']);
 const {count,error:legacyError}=await db.from('office_assistant_tasks').select('id',{count:'exact',head:true}).eq('user_id',session.userId).is('conversation_id',null);
 if(error||activeError||legacyError)throw new Error('Could not load chats');
 return {items:(data??[]).slice(0,size).map(c=>({...c,status:active?.some(t=>t.conversation_id===c.id&&t.status==='running')?'running':active?.some(t=>t.conversation_id===c.id)?'queued':null})),hasMore:(data??[]).length>size,legacyCount:count??0};
}
export async function listAssistantTasks(conversationId:string|null, before?:{createdAt:string;id:string}){
 const {session,db}=await access();
 if(conversationId!==null)uuid.parse(conversationId);
 let query=db.from('office_assistant_tasks').select('id,prompt,status,response,created_at,applied_id,conversation_id,executor,cloud_error,applications:office_assistant_applications(proposal_index,worker_id,status,message)').eq('user_id',session.userId);
 query=conversationId?query.eq('conversation_id',conversationId):query.is('conversation_id',null);
 if(before){const at=z.string().datetime({offset:true}).parse(before.createdAt),id=uuid.parse(before.id);query=query.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${id})`);}
 const {data,error}=await query.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(31);
 if(error)throw new Error('Could not load conversation');
 return {items:(data??[]).slice(0,30).reverse(),hasMore:(data??[]).length>30};
}
export async function renameAssistantConversation(id:string,title:string){
 const {session,db}=await access();uuid.parse(id);
 const name=title.trim();if(!name||name.length>120)return {ok:false,message:'Use a title between 1 and 120 characters.'};
 const {data,error}=await db.from('office_assistant_conversations').update({title:name}).eq('id',id).eq('user_id',session.userId).select('id').maybeSingle();
 return error||!data?{ok:false,message:'Could not rename the chat.'}:{ok:true,message:'Chat renamed.'};
}
export async function applyAssistantTask(id:string){const {db}=await access();const {error}=await db.rpc('office_apply_assistant_task',{p_id:id});if(error)return {ok:false,message:error.code==='P0001'?error.message:'Could not save the proposed record. No success was confirmed.'};const {data:task}=await db.from('office_assistant_tasks').select('response').eq('id',id).maybeSingle();revalidatePath('/office');return {ok:true,message:task?.response?.action==='prepare_client_invoice'?'Invoice draft prepared. Open Client invoices to review the calculated amount before approval.':'Record created. Your company directory is updated.'};}

export async function applyAssistantContractors(id:string,indices:number[]|null=null){
 const {db}=await access();uuid.parse(id);if(indices!==null)z.array(z.number().int().min(0).max(99)).min(1).max(100).parse(indices);
 const {data,error}=await db.rpc('office_apply_assistant_contractors',{p_id:id,p_indices:indices});
 if(error)return {ok:false,message:error.code==='P0001'?error.message:'Could not confirm this batch. Refresh before retrying.'};
 const rows=Array.isArray(data)?data:[];const created=rows.filter(r=>r.status==='created').length,existing=rows.filter(r=>r.status==='existing').length,review=rows.filter(r=>r.status==='review').length;
 revalidatePath('/office');return {ok:true,message:`${created} created · ${existing} already registered${review?` · ${review} need review`:''}.`};
}
