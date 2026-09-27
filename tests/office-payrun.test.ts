import {describe,it,expect} from 'vitest';
import {latestPayday,payrunPeriod,invoiceInPayrun,payrunSummary,contractorForInvoice} from '../lib/office/payrun';
import {paymentReadiness} from '../lib/office/payment-readiness';
import type {OfficeData} from '../lib/office/foundation';
import type {InvoiceSnapshot} from '../lib/office/invoice-snapshot';
const data:OfficeData={finance:true,from:'2026-09-01',to:'2026-09-30',
 contractors:[{id:'w',fullName:'Example Person',abn:'51824753556',phone:'',email:'',group:'regular',active:true}],
 clients:[{id:'c',name:'Example Client',active:true}],projects:[{id:'s',clientId:'c',name:'Example Site',active:true}],
 entries:[{id:'e',workerId:'w',jobId:'s',workDate:'2026-09-14',actualHours:10,contractorHours:8,clientHours:12,agreementNote:'Agreed',locked:false,updatedAt:''}],
 rates:[{id:'r',workerId:'w',clientId:null,kind:'contractor',hourlyRateCents:8000,effectiveFrom:'2026-09-01',agreementNote:'Agreed',voidedAt:null}]};
const doc:InvoiceSnapshot['documents'][number]={id:'d',sourceHash:'a'.repeat(64),supplierId:'s',name:'Example Person',abn:'51824753556',email:'',phone:'',invoiceNumber:'EXAMPLE-1',issueDate:'2026-09-20',workPeriod:'14/09/2026 to 19/09/2026',received:'2026-09-27',amountCents:64000,gst:'0',currency:'AUD',tonnage:'0.8',recordType:'invoice',approved:false,duplicateOf:'',flags:[],source:'',filename:'example.pdf',paidCents:0,paymentStatus:'Unknown',payments:[]};
describe('Payment day flow',()=>{
 it('uses the agreed fortnight without inventing a paid date',()=>{expect(latestPayday('2026-09-27')).toBe('2026-09-25');expect(payrunPeriod('2026-09-25')).toEqual({from:'2026-09-07',to:'2026-09-20'});expect(payrunPeriod('2026-10-09')).toEqual({from:'2026-09-21',to:'2026-10-04'});});
 it('includes late arrivals by work period',()=>{expect(invoiceInPayrun(doc,'2026-09-07','2026-09-20')).toBe(true);expect(invoiceInPayrun({...doc,workPeriod:'21/09/2026 to 25/09/2026'},'2026-09-07','2026-09-20')).toBe(false);});
 it('does not assign invalid periods from received dates',()=>expect(invoiceInPayrun({...doc,workPeriod:'unknown'},'2026-09-07','2026-09-20')).toBe(false));
 it('shows actual and payable hours, site and date from work records',()=>{const s=payrunSummary(data,'2026-09-07','2026-09-20')[0];expect(s.actualHours).toBe(10);expect(s.payableHours).toBe(8);expect(s.rows[0].site).toBe('Example Site');expect(s.rows[0].workDate).toBe('2026-09-14');expect(s).not.toHaveProperty('amount');});
 it('keeps people with records even without an invoice and does not invent missing time',()=>{expect(payrunSummary(data,'2026-09-07','2026-09-20')).toHaveLength(1);expect(payrunSummary({...data,entries:[]},'2026-09-07','2026-09-20')).toEqual([]);});
 it('does not group by first name or ABN alone',()=>{expect(contractorForInvoice({...doc,name:'Another Person'},data)).toBeNull();expect(contractorForInvoice(doc,{...data,contractors:[...data.contractors,{...data.contractors[0],id:'second'}]})).toBeNull();});
 it('allows clean matched invoices without a separate approve step',()=>expect(paymentReadiness(doc,data,[doc],'digest',[]).status).toBe('ready'));
 it('requires review of revisions, invalid issue dates, amount differences and missing work',()=>{
  expect(paymentReadiness({...doc,flags:['Reused invoice number']},data,[doc],'digest',[]).status).toBe('review');
  expect(paymentReadiness({...doc,issueDate:'2026-02-30'},data,[doc],'digest',[]).status).toBe('review');
  expect(paymentReadiness({...doc,amountCents:65000},data,[doc],'digest',[]).status).toBe('review');
  expect(paymentReadiness(doc,{...data,entries:[]},[doc],'digest',[]).status).toBe('review');
 });
 it('blocks duplicates, buyer ABN, invalid ABN, test and zero documents even if approved',()=>{
  for(const change of [{duplicateOf:'original'},{abn:'62687072420'},{abn:'123'},{recordType:'test'},{amountCents:0}])
   expect(paymentReadiness({...doc,...change,approved:true},data,[doc],'digest',[]).status).toBe('blocked');
 });
 it('does not repeat a review of an already approved source',()=>expect(paymentReadiness({...doc,approved:true,flags:['Previously reviewed']},data,[doc],'digest',[]).status).toBe('ready'));
});
