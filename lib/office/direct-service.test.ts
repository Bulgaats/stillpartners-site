import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({officeData:vi.fn(),search:vi.fn(),read:vi.fn(),table:vi.fn(),docs:vi.fn(),records:vi.fn(),plans:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createServerSupabaseClient:async()=>({from:mocks.table}),createServiceRoleSupabaseClient:()=>null}));
vi.mock('./site-plan-data',()=>({readSitePlans:mocks.plans}));
vi.mock('./data',()=>({officeData:mocks.officeData}));
vi.mock('./document-data',()=>({documentRecords:mocks.docs}));
vi.mock('./company-record-data',()=>({companyRecords:mocks.records}));
vi.mock('./hosted-mail',()=>({searchHostedMail:mocks.search,readHostedMail:mocks.read}));
import {executeOfficeRead} from './direct-service';
import {directRequest} from './direct';
const person={id:'worker',fullName:'Example Person',shortName:'Example',aliases:[],abn:'51824753556',phone:'',email:'example@example.invalid',group:'regular',active:true};
const doc={id:'doc',supplierId:'supplier',name:person.fullName,abn:person.abn,email:'',phone:'',invoiceNumber:'SYN-1',issueDate:'2025-01-10',workPeriod:'2025-01-06 to 2025-01-07',received:'2025-01-10T00:00:00Z',amountCents:130000,gst:'0',currency:'AUD',tonnage:'2',recordType:'invoice',approved:false,duplicateOf:'',flags:[],source:'',filename:'test.pdf',paidCents:0,paymentStatus:'Unknown',payments:[]};
const snapshot={version:1,account:'work@stillpartners.net',sourceDigest:'a'.repeat(64),exportedAt:'2026-09-29T00:00:00Z',paymentsComplete:false,documents:[doc]};
const data={finance:true,from:'2025-01-06',to:'2025-01-07',contractors:[person],clients:[{id:'client',name:'Synthetic client',active:true}],projects:[{id:'site',clientId:'client',name:'Synthetic site',active:true}],entries:[{id:'one',workerId:'worker',jobId:'site',workDate:'2025-01-06',actualHours:8,contractorHours:10,clientHours:12,agreementNote:'test',locked:false,updatedAt:''},{id:'two',workerId:'worker',jobId:'site',workDate:'2025-01-07',actualHours:8,contractorHours:10,clientHours:12,agreementNote:'test',locked:false,updatedAt:''}],rates:[{id:'r1',workerId:'worker',clientId:null,kind:'contractor',hourlyRateCents:6000,effectiveFrom:'2025-01-01',agreementNote:'test',voidedAt:null},{id:'r2',workerId:'worker',clientId:null,kind:'contractor',hourlyRateCents:7000,effectiveFrom:'2025-01-07',agreementNote:'test',voidedAt:null}]};
beforeEach(()=>{vi.clearAllMocks();mocks.officeData.mockResolvedValue(structuredClone(data));mocks.table.mockImplementation(()=>{const q:Record<string,unknown>={select:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>({data:{payload:structuredClone(snapshot)},error:null}),range:async()=>({data:[],error:null})};return q;});});
describe('direct read service',()=>{
 it('reads missing plans from the shared service without Mac or invoice mutation',async()=>{mocks.plans.mockResolvedValue({plans:[{id:'p',workDate:'2026-09-29',client:'Example',site:'Example site',address:'Example address',reminderTime:'17:00',people:[{id:'w',fullName:'Example Person',shortName:'Example',active:true,entryId:null,hours:null,otherSites:[]}]}],enabled:true,lastScan:'2026-09-29T09:00:00Z'});const r=await executeOfficeRead('owner',directRequest.parse({kind:'missing_hours'}));expect(mocks.plans).toHaveBeenCalledWith(null,null,true);expect(r.rows[0].detail).toContain('Hours needed');expect(r.rows[0].source).toBe('/office?view=plans&date=2026-09-29');expect(mocks.officeData).not.toHaveBeenCalled();});
 it('loads exact invoice work dates, even older than 90 days, and uses separate payable hours and dated rates',async()=>{
  const result=await executeOfficeRead('owner',directRequest.parse({kind:'check_invoice',id:'doc'}));
  expect(mocks.officeData).toHaveBeenCalledWith(true,'2025-01-06','2025-01-07');
  expect(result.status).toBe('match');expect(result.rows[0].detail).toContain('Expected: $1,300.00');expect(result.rows[0].detail).toContain('Actual hours: 16 · Payable hours: 20');
 });
 it('missing work never becomes a match or zero-hours payment decision',async()=>{
  mocks.officeData.mockResolvedValue({...data,entries:[]});const result=await executeOfficeRead('owner',directRequest.parse({kind:'check_invoice',id:'doc'}));expect(result.status).toBe('review');expect(result.issues?.join(' ')).toContain('Missing records do not mean zero work');
 });
 it('resolves owner-assigned short names to stored invoice identity',async()=>{const r=await executeOfficeRead('owner',directRequest.parse({kind:'invoices',query:'Example'}));expect(r.rows).toHaveLength(1);expect(r.coverage).toContain('Not a live Gmail import');});
 it('uses Perth midnight bounds, no default 14-day limit on an explicit older range, and preserves pagination',async()=>{
  mocks.search.mockResolvedValue({items:[],nextPageToken:'next'});const r=await executeOfficeRead('owner',directRequest.parse({kind:'mail',from:'2025-01-01',to:'2025-01-01',cursor:'page2'}));
  expect(mocks.search).toHaveBeenCalledWith('owner','after:1735660800 before:1735747200','page2');expect(r.nextCursor).toBe('next');
 });
 it('company document results retain private file handles without local-Mac dependencies',async()=>{
  mocks.docs.mockResolvedValue([{id:'document',status:'active',title:'Example CV',category:'cv',entity_type:'contractor',entity_id:'worker',notes:'',source_note:'Original retained',source_url:'',files:[{id:'file',filename:'cv.pdf'}]}]);
  const r=await executeOfficeRead('owner',directRequest.parse({kind:'documents',query:'Example'}));expect(r.rows[0].files?.[0].url).toBe('/api/office/documents/file?id=file');
 });
});
