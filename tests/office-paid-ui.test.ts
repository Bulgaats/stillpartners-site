import {describe,it,expect,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()}),useSearchParams:()=>new URLSearchParams()}));
vi.mock('../app/actions/invoice-events',()=>({markOfficeInvoicePaid:vi.fn(),recordOfficeInvoiceEvent:vi.fn()}));
import {InvoicePaymentControls} from '../components/office/invoice-payment-controls';
import type {InvoiceSnapshot} from '../lib/office/invoice-snapshot';
const document={id:'fixture',amountCents:12000,paidCents:0,payments:[],approved:false,name:'Example Supplier',invoiceNumber:'TEST-1',workPeriod:'2026-09-07 to 2026-09-20'} as unknown as InvoiceSnapshot['documents'][number];
const props={document,digest:'a'.repeat(64),events:[],today:'2026-09-27',receipts:[]};
describe('Payment controls rendered for the owner',()=>{
 it('shows amount/date and direct Paid without a separate Approve or checkbox',()=>{
  const html=renderToStaticMarkup(createElement(InvoicePaymentControls,{...props,readiness:{status:'ready',issues:[]}}));
  expect(html).toContain('>Mark as paid</button>');expect(html).toContain('>Review</button>');expect(html).toContain('value="120.00"');expect(html).toContain('2026-09-27');
  expect(html).not.toContain('Approve invoice');expect(html).not.toContain('type="checkbox"');
  expect(html).toContain('Amount paid (AUD)');expect(html).toContain('Actual payment date');
 });
 it('keeps Review separate and Paid enabled with optional comments despite warnings',()=>{
  const html=renderToStaticMarkup(createElement(InvoicePaymentControls,{...props,readiness:{status:'review',issues:['Revised invoice number']}}));
  expect(html).toContain('>Review</button>');expect(html).toContain('class="ember-primary">Mark as paid</button>');expect(html).toContain('Add comments');expect(html).not.toContain('Review &amp; mark paid');expect(html).not.toContain('Resolution / why payment is correct');expect(html).not.toContain(' required');
 });
 it('does not offer a payment action for a duplicate or invalid source',()=>{
  const html=renderToStaticMarkup(createElement(InvoicePaymentControls,{...props,readiness:{status:'blocked',issues:['Duplicate source']}}));
  expect(html).toContain('Source needs correction');expect(html).not.toContain('>Mark as paid</button>');expect(html).not.toContain('Amount paid (AUD)');
 });
 it('hides payment entry when the remaining balance is zero',()=>{
  const html=renderToStaticMarkup(createElement(InvoicePaymentControls,{...props,document:{...document,paidCents:12000},readiness:{status:'ready',issues:[]}}));
  expect(html).toContain('<strong>Paid</strong>');expect(html).toContain('class="office-paid-complete" disabled="">Paid ✓</button>');expect(html).not.toContain('Mark as paid');expect(html).not.toContain('Amount paid (AUD)');
 });
});
