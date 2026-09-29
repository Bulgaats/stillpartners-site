import 'server-only';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import type {PlanRead} from './site-plans';
export async function readSitePlans(from:string|null,to:string|null,dueOnly=false):Promise<PlanRead>{
 const db=await createServerSupabaseClient();
 const {data,error}=await db.rpc('office_read_site_plans',{p_from:from,p_to:to,p_due_only:dueOnly});
 if(error)throw new Error('Site plans could not be loaded. Existing plans are retained.');
 return data as PlanRead;
}
