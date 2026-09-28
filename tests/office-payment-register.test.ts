import {beforeEach,describe,it,expect,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const f=vi.hoisted(()=>({query:''}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()}),useSearchParams:()=>new URLSearchParams(f.query)}));
vi.mock('../app/actions/invoice-events',()=>({markOfficeInvoicePaid:vi.fn(),recordOfficeInvoiceEvent:vi.fn()}));
vi.mock('../app/actions/invoice-snapshot',()=>({importOfficeInvoiceSnapshot:vi.fn()}));
vi.mock('../app/actions/mac-sync',()=>({revokeMacSync:vi.fn()}));
vi.mock('../components/office/invoice-check',()=>({InvoiceCheck:()=>null}));
vi.mock('../components/office/payrun-summary',()=>({PayrunSummary:()=>null}));
import {InvoiceRegister} from '../components/office/invoice-register';
import type {InvoiceSnapshot} from '../lib/office/invoice-snapshot';
import type {OfficeData} from '../lib/office/foundation';
import type {MacSync} from '../lib/office/mac-sync';
import type {InvoiceEvent} from '../lib/office/invoice-events';
const digest='a'.repeat(64);
const doc={id:'example',sourceHash:'b'.repeat(64),supplierId:'example',name:'Example Supplier',abn:'51824753556',email:'',phone:'',invoiceNumber:'OPEN-EXAMPLE',issueDate:'2026-09-20',workPeriod:'2026-09-07 to 2026-09-20',received:'2026-09-27',amountCents:12000,gst:'',currency:'AUD',tonnage:'',recordType:'invoice',approved:false,duplicateOf:'',flags:[],source:'',filename:'example.pdf',paidCents:0,paymentStatus:'Unknown',payments:[]};
const snapshot={version:1,account:'work@stillpartners.net',sourceDigest:digest,exportedAt:'2026-09-27T00:00:00Z',paymentsComplete:false,documents:[doc,{...doc,id:'paid-example',invoiceNumber:'PAID-EXAMPLE'}]} as InvoiceSnapshot;
const payment:InvoiceEvent={id:'payment-example',document_id:'paid-example',kind:'payment',source_digest:digest,amount_cents:12000,payment_date:'2026-09-27',reason:'Confirmed transfer',target_id:null,created_at:''};
const data={finance:true,from:'2026-09-07',to:'2026-09-20',contractors:[],clients:[],projects:[],entries:[],rates:[]} as OfficeData;
const props={snapshot,events:[payment],today:'2026-09-25',sync:{devices:[],receipts:[]} as unknown as MacSync,data};
beforeEach(()=>{f.query='';});
describe('To pay and Paid invoices rendered register',()=>{
 it('defaults to To pay, removes full paid invoices, and keeps the next invoice payable',()=>{
  const html=renderToStaticMarkup(createElement(InvoiceRegister,props));
  expect(html).toContain('aria-pressed="true"><span aria-hidden="true">✓ </span>To pay <span>1</span>');
  expect(html).toContain('Paid invoices <span>1</span>');
  expect(html).toContain('OPEN-EXAMPLE');expect(html).not.toContain('PAID-EXAMPLE');
  expect(html).toContain('>Mark as paid</button>');
 });
 it('shows only completed invoices with a green disabled Paid control in Paid invoices',()=>{
  f.query='payments=paid';
  const html=renderToStaticMarkup(createElement(InvoiceRegister,props));
  expect(html).toContain('aria-pressed="true"><span aria-hidden="true">✓ </span>Paid invoices');
  expect(html).toContain('PAID-EXAMPLE');expect(html).not.toContain('OPEN-EXAMPLE');
  expect(html).toContain('class="office-paid-complete" disabled="">Paid ✓</button>');
  expect(html).not.toContain('>Mark as paid</button>');
 });
 it('keeps part-paid invoices in To pay and presents only the remaining amount',()=>{
  const html=renderToStaticMarkup(createElement(InvoiceRegister,{...props,events:[{...payment,amount_cents:5000}]}));
  expect(html).toContain('To pay <span>2</span>');
  expect(html).toContain('Part-paid');expect(html).toContain('value="70.00"');
  expect(html).toContain('PAID-EXAMPLE');
 });
});
