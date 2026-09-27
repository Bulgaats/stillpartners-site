import {createServiceRoleSupabaseClient} from '@/lib/supabase/server';
import {cloudConfig} from './config';
import {CloudTools} from './tools';
import {runCloudAssistant} from './runtime';
import {invoiceSnapshotSchema} from '../invoice-snapshot';
import type {InvoiceEvent} from '../invoice-events';
export async function processCloudTask(owner:string,id:string){
 const config=cloudConfig(),db=createServiceRoleSupabaseClient();if(!config.enabled||!db)return;
 const {data:task,error}=await db.rpc('office_cloud_exchange',{p_owner:owner,p_request:{action:'claim',id,dailyLimit:config.daily}});
 if(error)throw new Error('Cloud task could not be claimed');if(!task?.id)return;
 try{
  const {data:saved,error:snapshotError}=await db.from('office_invoice_snapshots').select('payload').order('exported_at',{ascending:false}).limit(1).maybeSingle();
  if(snapshotError)throw new Error('Invoice snapshot could not be loaded');
  const snapshot=saved?invoiceSnapshotSchema.parse(saved.payload):null,events:InvoiceEvent[]=[];
  for(let start=0;;start+=500){
   const {data,error}=await db.from('office_invoice_events').select('*').order('id').range(start,start+499);
   if(error)throw new Error('Current payment evidence could not be loaded');events.push(...(data??[]) as InvoiceEvent[]);if((data?.length??0)<500)break;
  }
  const tools=new CloudTools(owner,task.context,snapshot,events);
  // Full records stay behind paginated retrieval; pass only summary + the selected chat history up front.
  const summary=Object.fromEntries(Object.entries(task.context as Record<string,unknown>).map(([key,value])=>[key,Array.isArray(value)&&key!=='conversation'?{count:value.length,readWith:'search_company_records'}:value]));
  const response=await runCloudAssistant({prompt:task.prompt,context:summary,model:config.model,effort:config.effort,key:process.env.OPENAI_API_KEY!,execute:(name,args)=>tools.execute(name,args)});
  const result=await db.rpc('office_cloud_exchange',{p_owner:owner,p_request:{action:'complete',id,lease_id:task.lease_id,status:'done',response}});
  if(result.error||!result.data?.ok)throw new Error('Cloud result not committed');
 }catch{
  // Never persist provider response bodies or source text in exception logs.
  await db.rpc('office_cloud_exchange',{p_owner:owner,p_request:{action:'complete',id,lease_id:task.lease_id,status:'error',error:'Cloud reply could not finish. Check Cloud connections and API access, then retry. No proposal was applied.',response:{reply:'Cloud reply could not finish. No proposal was applied.'}}});
 }
}
