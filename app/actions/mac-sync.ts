'use server';
import {getSessionProfile} from '@/lib/auth/session';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {revalidatePath} from 'next/cache';
export async function revokeMacSync(id:string){
 const session=await getSessionProfile();if(!session||session.profile.role!=='admin')return {ok:false,message:'Finance admin access required.'};
 const db=await createServerSupabaseClient();const {error}=await db.rpc('office_revoke_mac',{p_id:id});if(error)return {ok:false,message:'Could not disconnect this Mac.'};revalidatePath('/office');return {ok:true,message:'Mac access revoked. Existing records are retained.'};
}
