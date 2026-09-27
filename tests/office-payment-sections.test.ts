import {describe,it,expect} from 'vitest';
import {invoiceState,invoicePaymentSection,mergeConfirmedPayments,type InvoiceEvent} from '../lib/office/invoice-events';
import type {InvoiceSnapshot} from '../lib/office/invoice-snapshot';
const digest='a'.repeat(64);
const d={id:'example',amountCents:12000,paidCents:0,payments:[],approved:false} as unknown as InvoiceSnapshot['documents'][number];
const payment:InvoiceEvent={id:'payment-1',document_id:d.id,kind:'payment',source_digest:digest,amount_cents:12000,payment_date:'2026-09-27',reason:'Owner confirmed transfer',target_id:null,created_at:''};
describe('Confirmed payment movement and refresh reconciliation',()=>{
 it('moves a full acknowledged payment out of To pay before the server refresh',()=>{
  expect(invoicePaymentSection(d,digest,[])).toBe('to-pay');
  const merged=mergeConfirmedPayments([],[payment]);
  expect(invoicePaymentSection(d,digest,merged)).toBe('paid');
  expect(invoiceState(d,digest,merged).paid).toBe(12000);
 });
 it('keeps a partial payment in To pay and moves only after the remaining balance',()=>{
  const part={...payment,amount_cents:5000};
  expect(invoicePaymentSection(d,digest,[part])).toBe('to-pay');
  expect(invoiceState(d,digest,[part]).status).toBe('Part-paid');
  expect(invoicePaymentSection(d,digest,[part,{...payment,id:'payment-2',amount_cents:7000}])).toBe('paid');
 });
 it('does not duplicate a confirmation when fresh server rows arrive',()=>{
  const stored={...payment,created_at:'2026-09-27T04:00:00Z'};
  const merged=mergeConfirmedPayments([stored],[payment]);
  expect(merged).toEqual([stored]);
  expect(invoiceState(d,digest,merged).paid).toBe(12000);
 });
 it('does not count the same acknowledged payment again after Mac absorption',()=>{
  const synced={...d,paidCents:12000,payments:[{id:payment.id,date:payment.payment_date!,amountCents:12000}]};
  expect(invoiceState(synced,digest,mergeConfirmedPayments([],[payment])).paid).toBe(12000);
  expect(invoicePaymentSection(synced,digest,[payment])).toBe('paid');
 });
 it('reopens a cancelled cloud payment without allowing a stale acknowledgement to restore it',()=>{
  const cancelled:InvoiceEvent={...payment,id:'void-1',kind:'void',amount_cents:null,payment_date:null,target_id:payment.id};
  const merged=mergeConfirmedPayments([cancelled],[payment]);
  expect(invoicePaymentSection(d,digest,merged)).toBe('to-pay');
  expect(invoiceState(d,digest,merged).paid).toBe(0);
 });
 it('changes only the exact invoice, not another invoice from the same supplier',()=>{
  expect(invoicePaymentSection({...d,id:'other'},digest,[payment])).toBe('to-pay');
 });
});
