"use server";
import {workSchema,saveWork} from "@/lib/office/work-save";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth/session";
import { canAccessOperations } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validAbn } from "@/lib/office/foundation";

export type OfficeResult={ok:boolean;message:string};
async function access(finance=true) {
  const session=await getSessionProfile();
  if(!session || !canAccessOperations(session.profile.role) || (finance && session.profile.role!=="admin"))throw new Error("Your account cannot perform this action.");
  return createServerSupabaseClient();
}
function result(error: {message:string}|null,message:string): OfficeResult {
  if(error)return {ok:false,message:error.message};
  revalidatePath("/office");revalidatePath("/operations");return {ok:true,message};
}
const personSchema=z.object({id:z.string().uuid().nullable(),fullName:z.string().trim().min(2).max(160),email:z.string().trim().email().or(z.literal("")),phone:z.string().trim().max(40),abn:z.string().trim().transform(v=>v.replace(/\s/g,"")).refine(v=>!v || (v!=="62687072420" && validAbn(v)),"Enter the contractor's valid ABN, or leave it blank for review."),group:z.enum(["regular","occasional"]),active:z.boolean()});
export async function saveOfficeContractor(input:z.input<typeof personSchema>):Promise<OfficeResult> {
  const db=await access();const value=personSchema.safeParse(input);
  if(!value.success)return {ok:false,message:value.error.issues[0].message};
  const p=value.data;
  const response=await db.rpc("office_save_contractor",{p_id:p.id,p_name:p.fullName,p_email:p.email,p_phone:p.phone,p_abn:p.abn,p_group:p.group,p_active:p.active});
  return result(response.error,"Contractor contact saved.");
}
const importSchema=z.object({id:z.string().uuid(),action:z.enum(['create','link','dismiss']),note:z.string().trim().min(3).max(2000),workerId:z.string().uuid().nullable(),contact:personSchema.omit({id:true}).nullable()});
export async function resolveOfficeContactImport(input:z.input<typeof importSchema>):Promise<OfficeResult> {
  const db=await access();const parsed=importSchema.safeParse(input);
  if(!parsed.success)return {ok:false,message:parsed.error.issues[0].message};
  const v=parsed.data;
  if((v.action==='create'&&!v.contact)||(v.action==='link'&&!v.workerId))return {ok:false,message:'Choose the contractor details for this review.'};
  const response=await db.rpc('office_resolve_contact_import',{p_import:v.id,p_action:v.action,p_note:v.note,p_worker:v.workerId,p_contact:v.contact});
  return result(response.error,v.action==='create'?'Contact added. Original source details retained.':v.action==='link'?'Source linked to the existing contact. Existing details were not overwritten.':'Source excluded from the directory; original details retained.');
}
const rateSchema=z.object({workerId:z.string().uuid(),clientId:z.string().uuid().nullable(),kind:z.enum(["contractor","client"]),hourlyRateCents:z.number().int().min(1).max(10000000),effectiveFrom:z.string().date(),agreementNote:z.string().trim().min(3).max(2000)}).refine(v=>v.kind!=="client" || !!v.clientId,"Select a client for the billing rate.");
export async function addOfficeRate(input:z.input<typeof rateSchema>):Promise<OfficeResult> {
  const db=await access();const parsed=rateSchema.safeParse(input);
  if(!parsed.success)return {ok:false,message:parsed.error.issues[0].message};
  const v=parsed.data;
  const response=await db.from("office_rates").insert({worker_id:v.workerId,client_id:v.clientId,kind:v.kind,hourly_rate_cents:v.hourlyRateCents,effective_from:v.effectiveFrom,agreement_note:v.agreementNote});
  if(response.error?.code==="23505")return {ok:false,message:"A rate already starts on that date. Void an incorrect entry with a reason before replacing it."};
  return result(response.error,"New rate saved with its effective date. Earlier rates remain in history.");
}
export async function voidOfficeRate(input:{id:string;reason:string}):Promise<OfficeResult> {
  const db=await access();const parsed=z.object({id:z.string().uuid(),reason:z.string().trim().min(3).max(2000)}).safeParse(input);
  if(!parsed.success)return {ok:false,message:"Select the rate and enter a correction reason."};
  const response=await db.from("office_rates").update({voided_at:new Date().toISOString(),void_reason:parsed.data.reason}).eq("id",parsed.data.id).is("voided_at",null).select("id");
  if(!response.error && !response.data?.length)return {ok:false,message:"Rate changed. Reload before correcting it."};
  return result(response.error,"Incorrect rate voided; its history is retained.");
}
export async function saveOfficeWork(input:z.input<typeof workSchema>):Promise<OfficeResult> {
  const db=await access(false);
  const saved=await saveWork(db,input);
  if(saved.ok){revalidatePath("/office");revalidatePath("/operations");}
  return saved;
}

// One browser request and one revalidation; existing per-row RPC remains authoritative.
export async function saveOfficeWorkBatch(inputs:z.input<typeof workSchema>[]){
 const db=await access(false);
 const parsed=z.array(workSchema).min(1).max(100).safeParse(inputs);
 if(!parsed.success)throw new Error('Choose between 1 and 100 valid work records.');
 const keys=parsed.data.map(v=>`${v.workDate}:${v.jobId}:${v.workerId}`);
 if(new Set(keys).size!==keys.length)throw new Error('Each work record must appear once.');
 const results:{key:string;ok:boolean;message:string}[]=[];
 // Four distinct rows at a time. DB locks, timestamps and replay checks still apply.
 for(let start=0;start<parsed.data.length;start+=4){
  const group=await Promise.all(parsed.data.slice(start,start+4).map(async(v,i)=>{
   try{return {key:keys[start+i],...await saveWork(db,v)};}
   catch{return {key:keys[start+i],ok:false,message:'Save could not be confirmed. Your draft is retained for retry.'};}
  }));results.push(...group);
 }
 if(results.some(r=>r.ok)){revalidatePath('/office');revalidatePath('/operations');}
 return results;
}
