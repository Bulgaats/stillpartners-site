import { createServerSupabaseClient } from "@/lib/supabase/server";
import { type OfficeData } from "./foundation";
import type { ContactImport, ContactSource } from "./contact-import";

type Result = {data: Record<string, unknown>[] | null; error: {message: string} | null};
async function allRows(fetchPage: (start: number,end: number)=>PromiseLike<Result>) {
  const rows: Record<string, unknown>[]=[];
  for(let start=0;;start+=500) {
    const result=await fetchPage(start,start+499);
    if(result.error)throw new Error(result.error.message);
    rows.push(...(result.data ?? []));
    if((result.data?.length ?? 0)<500)return rows;
  }
}
export async function officeData(finance: boolean,from: string,to: string): Promise<OfficeData> {
  const db=await createServerSupabaseClient();
  const [workers,settings,clients,projects,entries,rates,adjustments,imports,names]=await Promise.all([
    finance ? allRows((a,b)=>db.from("workers").select("id,full_name,email,phone,abn,is_active,account_enabled").order("id").range(a,b)) : allRows((a,b)=>db.rpc("office_roster").order("id").range(a,b)),
    finance ? allRows((a,b)=>db.from("office_contractor_settings").select("worker_id,engagement_group").order("worker_id").range(a,b)) : [],
    finance ? allRows((a,b)=>db.from("clients").select("id,name,is_active").order("id").range(a,b)) : [],
    allRows((a,b)=>db.rpc("office_locations").order("id").range(a,b)),
    allRows((a,b)=>db.from("work_entries").select("id,worker_id,job_id,work_date,hours,updated_at,approved,locked").gte("work_date",from).lte("work_date",to).order("id").range(a,b)),
    finance ? allRows((a,b)=>db.from("office_rates").select("id,worker_id,client_id,kind,hourly_rate_cents,effective_from,agreement_note,voided_at").order("id").range(a,b)) : [],
    finance ? allRows((a,b)=>db.from("office_work_adjustments").select("work_entry_id,contractor_hours,client_hours,agreement_note").order("work_entry_id").range(a,b)) : [],
    finance ? allRows((a,b)=>db.from("office_contact_imports").select("id,source_key,source_data,status,worker_id,review_note").order("id").range(a,b)) : []
    ,finance ? allRows((a,b)=>db.from("office_contractor_names").select("worker_id,short_name,aliases,version").order("worker_id").range(a,b)) : []
  ]);
  const nicknames=new Map(names.map(n=>[String(n.worker_id),n]));
  const groups=new Map(settings.map(row=>[String(row.worker_id),row.engagement_group]));
  const agreed=new Map(adjustments.map(row=>[String(row.work_entry_id),row]));
  const visibleClients=finance ? clients : Array.from(new Map(projects.map(p=>[String(p.client_id),{id:p.client_id,name:p.client_name,is_active:p.client_active}])).values());
  return {finance,from,to,
    contactImports:imports.map(r=>({id:String(r.id),sourceKey:String(r.source_key),source:r.source_data as ContactSource,status:r.status as ContactImport['status'],workerId:r.worker_id?String(r.worker_id):null,reviewNote:String(r.review_note??'')})),
    contractors:workers.map(w=>({id:String(w.id),fullName:String(w.full_name),shortName:String(nicknames.get(String(w.id))?.short_name??""),aliases:(nicknames.get(String(w.id))?.aliases??[]) as string[],nameVersion:Number(nicknames.get(String(w.id))?.version??0),phone:String(w.phone ?? ""),email:String(w.email ?? ""),abn:String(w.abn ?? ""),group:groups.get(String(w.id))==="occasional"?"occasional":"regular",active:w.is_active!==false && w.account_enabled!==false})),
    clients:visibleClients.map(c=>({id:String(c.id),name:String(c.name),active:c.is_active!==false})),
    projects:projects.map(p=>({id:String(p.id),clientId:String(p.client_id),name:String(p.site_name ?? "Location"),active:p.project_active===true && p.client_active!==false})),
    entries:entries.map(e=>{const a=agreed.get(String(e.id));return {id:String(e.id),workerId:String(e.worker_id),jobId:String(e.job_id),workDate:String(e.work_date),actualHours:Number(e.hours),contractorHours:finance?Number(a?.contractor_hours ?? e.hours):null,clientHours:finance?Number(a?.client_hours ?? e.hours):null,agreementNote:String(a?.agreement_note ?? ""),locked:Boolean(e.locked || e.approved),updatedAt:String(e.updated_at)};}),
    rates:rates.map(r=>({id:String(r.id),workerId:String(r.worker_id),clientId:r.client_id?String(r.client_id):null,kind:r.kind==="client"?"client":"contractor",hourlyRateCents:Number(r.hourly_rate_cents),effectiveFrom:String(r.effective_from),agreementNote:String(r.agreement_note),voidedAt:r.voided_at?String(r.voided_at):null}))
  };
}
