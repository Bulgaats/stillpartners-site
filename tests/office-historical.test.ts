import {describe,it,expect} from 'vitest';
import {invoiceState,invoicePaymentSection} from '../lib/office/invoice-events';
import type {InvoiceSnapshot} from '../lib/office/invoice-snapshot';
import {upcomingPayday} from '../lib/office/payrun';
import {paymentSourceIssues} from '../lib/office/payment-readiness';
const d={id:'fixture',sourceHash:'a'.repeat(64),amountCents:10000,paidCents:0,payments:[],approved:false,historicalClosure:{kind:'settled',source_hash:'a'.repeat(64),cutoff:'2026-09-20',confirmed_at:'2026-09-27',basis:'work_period',basis_date:'2026-09-20'}} as InvoiceSnapshot['documents'][number];
describe('Historical settlement remains separate from cash history',()=>{
 it('archives a settled invoice without inventing a payment',()=>{const s=invoiceState(d,'a',[]);expect(s.status).toBe('Paid');expect(s.paid).toBe(0);expect(s.payments).toEqual([]);expect(invoicePaymentSection(d,'a',[])).toBe('archived');});
 it('does not label test references as paid',()=>expect(invoiceState({...d,historicalClosure:{...d.historicalClosure!,kind:'reference'}},'a',[]).status).toBe('Archived'));
 it('invalidates an old closure when source bytes change',()=>expect(invoiceState({...d,sourceHash:'b'.repeat(64)},'b',[]).status).toBe('Unknown'));
 it('defaults to the next active payrun after payday',()=>{expect(upcomingPayday('2026-09-25')).toBe('2026-09-25');expect(upcomingPayday('2026-09-27')).toBe('2026-10-09');});
});
