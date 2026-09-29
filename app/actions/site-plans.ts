'use server';
import {z} from 'zod';
import {getSessionProfile} from '@/lib/auth/session';
import {canAccessOperations} from '@/lib/auth/roles';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {readSitePlans} from '@/lib/office/site-plan-data';
import {sitePlanInput,type SitePlanInput} from '@/lib/office/site-plans';
import {revalidatePath} from 'next/cache';
async function access(){const s=await getSessionProfile();if(!s||!canAccessOperations(s.profile.role))throw new Error('Operations access required');return createServerSupabaseClient();}
export async function listSitePlans(day:string){await access();z.string().date().parse(day);return readSitePlans(day,day);}
export async function missingWorkPlans(){await access();return readSitePlans(null,null,true);}
export async function saveSitePlan(input:SitePlanInput){
 const db=await access(),parsed=sitePlanInput.safeParse(input);
 if(!parsed.success)return {ok:false,message:parsed.error.issues[0].message};
 const {data,error}=await db.rpc('office_save_site_plan',{p_event:parsed.data.eventId,p_plan:parsed.data});
 if(error)return {ok:false,message:error.code==='P0001'?error.message:'Save could not be confirmed. Retry the same request.'};
 revalidatePath('/office');return {ok:true,message:'Site plan saved. Actual hours remain separate.',plan:data};
}
