import {createServerSupabaseClient} from '@/lib/supabase/server';
import type {CompanyRecord} from './company-records';
export async function companyRecords(){
 const db=await createServerSupabaseClient();const rows:CompanyRecord[]=[];
 for(let start=0;;start+=300){const {data,error}=await db.from('office_company_records').select('*').order('id').range(start,start+299);if(error)throw new Error('Company memory and work records could not be loaded');rows.push(...(data??[]) as CompanyRecord[]);if((data?.length??0)<300)return rows;}
}
