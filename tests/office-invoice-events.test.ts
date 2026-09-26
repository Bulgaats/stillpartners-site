import {describe,it,expect} from 'vitest';
import {invoiceState,type InvoiceEvent} from '../lib/office/invoice-events';
import type {InvoiceSnapshot} from '../lib/office/invoice-snapshot';
const doc={id:'d',paidCents:0,amountCents:10000,payments:[],approved:false} as unknown as InvoiceSnapshot['documents'][number];
const event=(id:string,kind:InvoiceEvent['kind'],amount:number|null,target:string|null=null):InvoiceEvent=>({id,kind,amount_cents:amount,target_id:target,source_digest:'current',document_id:'d',payment_date:'2026-09-25',created_at:'',reason:'Confirmed by user'});
describe('Office payment totals',()=>{
 it('does not interpret absent evidence as unpaid',()=>expect(invoiceState(doc,'current',[]).status).toBe('Unknown'));
 it('counts partial and full payments',()=>{expect(invoiceState(doc,'current',[event('p','payment',4000)]).status).toBe('Part-paid');expect(invoiceState(doc,'current',[event('p','payment',10000)]).status).toBe('Paid');});
 it('excludes cancelled entries without deleting history',()=>expect(invoiceState(doc,'current',[event('p','payment',10000),event('v','void',null,'p')]).paid).toBe(0));
 it('does not double-count payments included by the Mac',()=>{const d={...doc,paidCents:10000,payments:[{id:'p',date:'2026-09-25',amountCents:10000}]};const s=invoiceState(d,'current',[event('p','payment',10000)]);expect(s.paid).toBe(10000);expect(s.pending).toBe(false);});
 it('requires approval of the current source version',()=>{expect(invoiceState(doc,'current',[event('a','approve',null)]).approved).toBe(true);expect(invoiceState(doc,'changed',[event('a','approve',null)]).approved).toBe(false);});
});
