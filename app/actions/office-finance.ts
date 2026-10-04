'use server';
import {z} from 'zod';
import {getSessionProfile} from '@/lib/auth/session';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {getOperationsWorkspaceData} from '@/lib/operations/data';
import {invoiceSnapshotSchema} from '@/lib/office/invoice-snapshot';
import type {InvoiceEvent} from '@/lib/office/invoice-events';
import type {MacSync} from '@/lib/office/mac-sync';

// Loaded on demand by authorised finance screens, never by the Daily landing page.
export async function loadOfficeFinance(from:string,to:string){
 const session=await getSessionProfile();
 if(!session||session.profile.role!=='admin')throw new Error('Finance access required.');
 z.string().date().parse(from);z.string().date().parse(to);
 const db=await createServerSupabaseClient();
 async function snapshot(){
  const {data,error}=await db.from('office_invoice_snapshots').select('payload').order('exported_at',{ascending:false}).limit(1).maybeSingle();
  if(error)throw new Error('Invoice register unavailable. Retry before recording payments.');
  if(!data)return null;
  const parsed=invoiceSnapshotSchema.safeParse(data.payload);
  if(!parsed.success)throw new Error('Invoice register needs attention. Payments are unavailable until it loads correctly.');
  return parsed.data;
 }
 async function events(){
  const all:InvoiceEvent[]=[];
  for(let offset=0;;offset+=1000){
   const {data,error}=await db.from('office_invoice_events').select('id,document_id,kind,source_digest,amount_cents,payment_date,reason,target_id,created_at').order('created_at').order('id').range(offset,offset+999);
   if(error)throw new Error('Payment history unavailable. Retry before recording payments.');
   all.push(...(data??[]) as InvoiceEvent[]);if((data?.length??0)<1000)return all;
  }
 }
 async function sync(){
  const state:MacSync={devices:[],receipts:[]};
  const {data,error}=await db.rpc('office_mac_status');
  if(error)throw new Error('Filing status unavailable. Retry to load finance.');
  state.devices=data??[];
  for(let offset=0;;offset+=1000){
   const r=await db.from('office_mac_receipts').select('event_id,status,file_state,message,updated_at').order('event_id').range(offset,offset+999);
   if(r.error)throw new Error('Filing history unavailable. Retry to load finance.');
   state.receipts.push(...r.data??[]);if((r.data?.length??0)<1000)return state;
  }
 }
 const [register,invoiceEvents,macSync,management]=await Promise.all([snapshot(),events(),sync(),getOperationsWorkspaceData({session,rangeStart:from,rangeEnd:to,includeLegacyWork:false})]);
 return {snapshot:register,invoiceEvents,macSync,clientInvoices:management.clientInvoices};
}
