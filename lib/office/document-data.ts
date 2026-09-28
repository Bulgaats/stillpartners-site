import {createServerSupabaseClient} from '@/lib/supabase/server';
import type {OfficeDocument} from './documents';
export async function documentRecords(){
 const db=await createServerSupabaseClient(),rows:OfficeDocument[]=[];
 for(let start=0;;start+=300){const {data,error}=await db.from('office_documents').select('*').order('id').range(start,start+299);if(error)throw new Error('Document catalogue could not be loaded');rows.push(...(data??[]) as OfficeDocument[]);if((data?.length??0)<300)return rows;}
}
