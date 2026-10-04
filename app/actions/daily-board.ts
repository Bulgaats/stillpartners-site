'use server';
import {z} from 'zod';
import {getSessionProfile} from '@/lib/auth/session';
import {canAccessOperations} from '@/lib/auth/roles';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {readOfficeDay} from '@/lib/office/day-data';
export async function loadOfficeDay(day:string){
 z.string().date().parse(day);
 const session=await getSessionProfile();
 if(!session||!canAccessOperations(session.profile.role))throw new Error('Operations access required');
 return readOfficeDay(await createServerSupabaseClient(),day,session.profile.role==='admin');
}
