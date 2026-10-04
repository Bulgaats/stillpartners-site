import {describe,it,expect,vi} from 'vitest';
import {daySaveInput,saveDayChanges} from '../lib/office/day-save';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const day='2026-10-04';
const plan=(n:number)=>({eventId:id(n+10),jobId:id(n),workDate:day,reminderTime:'17:00',workerIds:[id(n+100)],expectedVersion:0,note:''});
const work=(n:number)=>({workerId:id(n+100),jobId:id(n),workDate:day,actualHours:8,contractorHours:8,clientHours:8,agreementNote:'',expectedUpdatedAt:null});
function database(failure=''){
 const calls:string[]=[];
 const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>{calls.push(name);return {data:null,error:failure===name?{code:'P0001',message:'Conflict'}:null};});
 const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null,error:null})};
 return {db:{rpc,from:()=>q} as unknown as Parameters<typeof saveDayChanges>[0],calls,rpc};
}
describe('One daily save request',()=>{
 it('rejects mixed dates and repeated sites before saving',()=>{
  expect(daySaveInput.safeParse({day,plans:[plan(1),plan(1)],work:[]}).success).toBe(false);
  expect(daySaveInput.safeParse({day,plans:[],work:[{...work(1),workDate:'2026-10-05'}]}).success).toBe(false);
 });
 it('preserves request IDs and stops hours after a conflicting site plan',async()=>{
  const {db,rpc,calls}=database('office_save_site_plan');
  const r=await saveDayChanges(db,{day,plans:[plan(1),plan(2)],work:[work(1)]});
  expect(r.plans[0].ok).toBe(false);expect(r.work).toEqual([]);expect(calls).toEqual(['office_save_site_plan']);
  expect(rpc.mock.calls[0][1]).toEqual({p_event:plan(1).eventId,p_plan:plan(1)});
 });
 it('retains independent hours errors and successful plan receipts',async()=>{
  const {db,calls}=database('office_save_work_record');
  const r=await saveDayChanges(db,{day,plans:[plan(1)],work:[work(1),work(2)]});
  expect(r.plans[0].ok).toBe(true);expect(r.work.map(w=>w.ok)).toEqual([false,false]);
  expect(calls).toEqual(['office_save_site_plan','office_save_work_record','office_save_work_record']);
 });
 it('clear-site requests never delete work or financial records',async()=>{
  const {db,calls}=database();await saveDayChanges(db,{day,plans:[{...plan(1),workerIds:[]}],work:[]});
  expect(calls).toEqual(['office_save_site_plan']);
 });
});
