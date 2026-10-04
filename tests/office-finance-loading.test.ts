import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({session:vi.fn(),client:vi.fn(),management:vi.fn(),from:vi.fn(),rpc:vi.fn(),ranges:[] as string[],fail:'',invalid:false}));
vi.mock('@/lib/auth/session',()=>({getSessionProfile:mock.session}));
vi.mock('@/lib/supabase/server',()=>({createServerSupabaseClient:mock.client}));
vi.mock('@/lib/operations/data',()=>({getOperationsWorkspaceData:mock.management}));
vi.mock('@/lib/office/invoice-snapshot',()=>({invoiceSnapshotSchema:{safeParse:(p:unknown)=>({success:!mock.invalid,data:p})}}));
import {loadOfficeFinance} from '../app/actions/office-finance';
beforeEach(()=>{
 vi.clearAllMocks();mock.ranges=[];mock.fail='';mock.invalid=false;
 mock.session.mockResolvedValue({userId:'owner',profile:{role:'admin'}});
 mock.management.mockResolvedValue({clientInvoices:[{id:'historical'}]});
 mock.rpc.mockResolvedValue({data:[],error:null});
 mock.from.mockImplementation((table:string)=>{
  const query={select:()=>query,order:()=>query,limit:()=>query,maybeSingle:async()=>({data:{payload:{documents:[]}},error:null}),range:async(start:number)=>{
   mock.ranges.push(`${table}:${start}`);
   if(mock.fail===table)return {data:null,error:{message:'unavailable'}};
   return {data:Array.from({length:start===0?1000:1},(_,i)=>({id:`${table}-${start+i}`})),error:null};
  }};return query;
 });
 mock.client.mockResolvedValue({from:mock.from,rpc:mock.rpc});
});
describe('Demand-loaded finance safety',()=>{
 it('denies operations users and anonymous callers before any data access',async()=>{
  for(const role of [null,'operations_admin','worker']){
   mock.session.mockResolvedValue(role?{profile:{role}}:null);
   await expect(loadOfficeFinance('2026-10-01','2026-10-04')).rejects.toThrow('Finance access');
  }
  expect(mock.client).not.toHaveBeenCalled();expect(mock.management).not.toHaveBeenCalled();
 });
 it('retrieves every page of payment history and filing receipts',async()=>{
  const r=await loadOfficeFinance('2026-10-01','2026-10-04');
  expect(r.invoiceEvents).toHaveLength(1001);expect(r.macSync.receipts).toHaveLength(1001);
  expect(mock.ranges).toContain('office_invoice_events:1000');expect(mock.ranges).toContain('office_mac_receipts:1000');
  expect(r.clientInvoices).toEqual([{id:'historical'}]);
 });
 it('never returns an empty-payment substitute when history fails',async()=>{
  mock.fail='office_invoice_events';await expect(loadOfficeFinance('2026-10-01','2026-10-04')).rejects.toThrow('Payment history unavailable');
 });
 it('rejects a corrupt snapshot rather than showing an empty register',async()=>{
  mock.invalid=true;await expect(loadOfficeFinance('2026-10-01','2026-10-04')).rejects.toThrow('Invoice register needs attention');
 });
});
