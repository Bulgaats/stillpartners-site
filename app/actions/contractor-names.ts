'use server';
import {getSessionProfile} from '@/lib/auth/session';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {contractorNameInput} from '@/lib/office/contractor-names';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
async function access(){const s=await getSessionProfile();if(!s||s.profile.role!=='admin')throw new Error('Finance admin access required');return createServerSupabaseClient();}
export async function saveContractorName(eventId:string,input:unknown){const db=await access();z.string().uuid().parse(eventId);const v=contractorNameInput.safeParse(input);if(!v.success)return {ok:false,message:v.error.issues[0].message};const {error}=await db.rpc('office_save_contractor_name',{p_event:eventId,p_name:v.data});if(error)return {ok:false,message:error.code==='P0001'?error.message:'Could not confirm name changes. Reload before retrying.'};revalidatePath('/office');return {ok:true,message:'Short name saved for Bobby and future client summaries. Legal identity is unchanged.'};}
export async function applyContractorNamesTask(id:string){const db=await access();z.string().uuid().parse(id);const {error}=await db.rpc('office_apply_contractor_names',{p_task:id});if(error)return {ok:false,message:error.code==='P0001'?error.message:'Name changes could not be confirmed. Reload before retrying.'};revalidatePath('/office');return {ok:true,message:'All proposed short names saved. Bobby can find them across chats.'};}
