import {describe,it,expect,vi,beforeEach} from 'vitest';
import {dailyDraft,dayTeams,availableForSite,draftError} from '../lib/office/daily-board';
import type {OfficeEntry} from '../lib/office/foundation';
import type {SitePlan} from '../lib/office/site-plans';
const entry:OfficeEntry={id:'e',workerId:'p1',jobId:'s1',workDate:'2026-10-04',actualHours:0,contractorHours:0,clientHours:2,agreementNote:'Client minimum',locked:false,updatedAt:'v1'};
const plan={jobId:'s1',people:[{id:'p1',active:true},{id:'p2',active:false}]} as SitePlan;
describe('Single daily board',()=>{
 it('hides people already planned, recorded or locally selected anywhere that day',()=>{
  const teams=dayTeams([plan],[{...entry,workerId:'p3',jobId:'s2'}],{s3:['p4']});
  for(const id of ['p1','p3','p4'])expect(availableForSite(id,'s5',teams)).toBe(false);
  expect(availableForSite('p2','s5',teams)).toBe(true);
 });
 it('removal never erases actual work and restored hours remain visible',()=>{
  expect(dayTeams([plan],[entry],{s1:[]})).toEqual({s1:['p1']});
  expect(dayTeams([plan],[],{s1:[]})).toEqual({s1:[]});
 });
 it('preserves zero actual hours, separately agreed billing and concurrency version',()=>{
  const r=dailyDraft(entry);expect(r.actual).toBe('0');expect(r.bill).toBe('2');expect(r.expectedUpdatedAt).toBe('v1');expect(draftError(r,true)).toBe('');
 });
 it('never turns a planned blank into worked hours',()=>expect(draftError(dailyDraft(),true)).toContain('Enter hours'));
 it('rejects overlong days and unexplained payable exceptions',()=>{
  expect(draftError({...dailyDraft(entry),actual:'25'},false)).not.toBe('');
  expect(draftError({...dailyDraft(entry),note:''},true)).toContain('agreement');
 });
});
const mock=vi.hoisted(()=>({profile:vi.fn(),db:vi.fn(),rpc:vi.fn(),revalidate:vi.fn()}));
vi.mock('@/lib/auth/session',()=>({getSessionProfile:mock.profile}));
vi.mock('@/lib/supabase/server',()=>({createServerSupabaseClient:mock.db}));
vi.mock('next/cache',()=>({revalidatePath:mock.revalidate}));
import {saveOfficeWorkBatch} from '../app/actions/office';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const input=(n:number)=>({workerId:id(n),jobId:id(100),workDate:'2026-10-04',actualHours:8,contractorHours:8,clientHours:8,agreementNote:'',expectedUpdatedAt:null});
beforeEach(()=>{
 vi.clearAllMocks();mock.profile.mockResolvedValue({profile:{role:'admin'}});
 const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:null,error:null})};
 mock.rpc.mockResolvedValue({data:id(1),error:null});mock.db.mockResolvedValue({from:()=>query,rpc:mock.rpc});
});
describe('Daily batch uses existing guarded work service',()=>{
 it('keeps a failed row separate and invalidates once per destination',async()=>{
  mock.rpc.mockResolvedValueOnce({error:{message:'Record changed. Reload before saving'}});
  const r=await saveOfficeWorkBatch([input(1),input(2)]);
  expect(r.map(v=>v.ok)).toEqual([false,true]);expect(mock.revalidate.mock.calls).toEqual([['/office'],['/operations']]);
 });
 it('rejects repeated rows before making any write',async()=>{
  await expect(saveOfficeWorkBatch([input(1),input(1)])).rejects.toThrow('once');expect(mock.rpc).not.toHaveBeenCalled();
 });
 it('rejects an unauthorised caller',async()=>{
  mock.profile.mockResolvedValue(null);await expect(saveOfficeWorkBatch([input(1)])).rejects.toThrow('cannot');expect(mock.rpc).not.toHaveBeenCalled();
 });
});
