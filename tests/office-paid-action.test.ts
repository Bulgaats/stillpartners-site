import {beforeEach,describe,it,expect,vi} from 'vitest';
const f=vi.hoisted(()=>({
 session:vi.fn(),rpc:vi.fn(),from:vi.fn(),revalidate:vi.fn(),
 saved:{current:null as unknown},prior:{current:null as unknown}
}));
vi.mock('../lib/auth/session',()=>({getSessionProfile:f.session}));
vi.mock('../lib/supabase/server',()=>({createServerSupabaseClient:async()=>({from:f.from,rpc:f.rpc})}));
vi.mock('../lib/operations/dates',()=>({getPerthIsoDate:()=> '2026-09-27'}));
vi.mock('next/cache',()=>({revalidatePath:f.revalidate}));
import {markOfficeInvoicePaid} from '../app/actions/invoice-events';
const digest='a'.repeat(64);
const document={id:'fixture',sourceHash:'b'.repeat(64),supplierId:'example',name:'Example Supplier',abn:'51824753556',email:'',phone:'',invoiceNumber:'EXAMPLE-1',issueDate:'2026-09-20',workPeriod:'2026-09-07 to 2026-09-20',received:'2026-09-27',amountCents:12000,gst:'',currency:'AUD',tonnage:'',recordType:'invoice',approved:false,duplicateOf:'',flags:['Check source revision'],source:'',filename:'example.pdf',paidCents:0,paymentStatus:'Unknown',payments:[]};
const request={id:'00000000-0000-4000-8000-000000000001',reviewId:'00000000-0000-4000-8000-000000000002',documentId:'fixture',digest,amount:12000,day:'2026-09-27',expectedPaid:0};
beforeEach(()=>{
 vi.clearAllMocks();f.session.mockResolvedValue({userId:'owner',profile:{role:'admin'}});
 f.saved.current={version:1,account:'work@stillpartners.net',sourceDigest:digest,exportedAt:'2026-09-27T00:00:00Z',paymentsComplete:false,documents:[{...document}]};
 f.prior.current=null;f.rpc.mockResolvedValue({data:request.id,error:null});
 f.from.mockImplementation((table:string)=>{
  const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,
   maybeSingle:async()=>({data:table==='office_invoice_snapshots'?{payload:f.saved.current}:f.prior.current,error:null}),
   range:async()=>({data:[],error:null})};return q;
 });
});
describe('Owner Paid approval with optional comments',()=>{
 it('records a flagged invoice without opening Review or writing a comment',async()=>{
  const result=await markOfficeInvoicePaid(request);
  expect(result.ok).toBe(true);expect(f.rpc).toHaveBeenCalledTimes(1);
  const args=f.rpc.mock.calls[0][1];
  expect(args.p_reason).toContain('120.00 on 2026-09-27');
  expect(args.p_review_reason).toContain('by pressing Paid');
  expect(args.p_review_reason).not.toMatch(/calculation matched|reviewed exceptions/);
  expect(f.from.mock.calls.every(([table])=>['office_invoice_events','office_invoice_snapshots'].includes(table))).toBe(true);
 });
 it('stores optional comments with the payment even when already approved',async()=>{
  (f.saved.current as any).documents[0].approved=true;
  expect((await markOfficeInvoicePaid({...request,reviewNote:'Transfer reference checked'})).ok).toBe(true);
  expect(f.rpc.mock.calls[0][1].p_reason).toContain('Comment: Transfer reference checked');
 });
 it('still refuses duplicate sources and does not write a payment',async()=>{
  (f.saved.current as any).documents[0].duplicateOf='original';
  expect((await markOfficeInvoicePaid(request)).ok).toBe(false);expect(f.rpc).not.toHaveBeenCalled();
 });
 it('refuses a changed payment balance or source',async()=>{
  expect((await markOfficeInvoicePaid({...request,expectedPaid:100})).ok).toBe(false);
  expect((await markOfficeInvoicePaid({...request,digest:'c'.repeat(64)})).ok).toBe(false);
  expect(f.rpc).not.toHaveBeenCalled();
 });
 it('refuses non-finance users',async()=>{
  f.session.mockResolvedValue({userId:'operator',profile:{role:'operations_admin'}});
  expect((await markOfficeInvoicePaid(request)).ok).toBe(false);expect(f.rpc).not.toHaveBeenCalled();
 });
 it('reconciles a replay without adding a second payment',async()=>{
  f.prior.current={created_by:'owner',kind:'payment',document_id:'fixture',source_digest:digest,amount_cents:12000,payment_date:'2026-09-27',reason:'Owner marked Paid: AUD 120.00 on 2026-09-27.'};
  expect((await markOfficeInvoicePaid(request)).ok).toBe(true);expect(f.rpc).not.toHaveBeenCalled();
 });
});
