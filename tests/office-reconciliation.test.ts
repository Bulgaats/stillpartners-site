import {describe,it,expect} from 'vitest';
import {invoicePeriod,reconcileInvoice} from '../lib/office/reconciliation';
import type {OfficeData} from '../lib/office/foundation';
import type {InvoiceSnapshot} from '../lib/office/invoice-snapshot';
const data:OfficeData={finance:true,from:'2026-09-01',to:'2026-09-30',clients:[{id:'c',name:'Example client',active:true}],projects:[{id:'s',clientId:'c',name:'Example site',active:true}],contractors:[{id:'w',fullName:'Example Person',abn:'51824753556',phone:'',email:'',group:'regular',active:true}],rates:[{id:'r',workerId:'w',clientId:null,kind:'contractor',hourlyRateCents:8000,effectiveFrom:'2026-09-01',agreementNote:'Test agreement',voidedAt:null}],entries:[{id:'e',workerId:'w',jobId:'s',workDate:'2026-09-14',actualHours:10,contractorHours:8,clientHours:12,agreementNote:'Different agreed hours',locked:false,updatedAt:''}]};
const doc={id:'d',name:'Example Person',abn:'51824753556',recordType:'invoice',currency:'AUD',workPeriod:'14/09/2026 to 19/09/2026',amountCents:64000,gst:'0',flags:[],duplicateOf:''} as unknown as InvoiceSnapshot['documents'][number];
describe('Invoice/time reconciliation',()=>{
 it('uses payable hours and contractor rate, not actual or billable hours',()=>{const r=reconcileInvoice(doc,data,[doc]);expect(r.status).toBe('match');expect(r.expectedTotalCents).toBe(64000);expect(r.actualHours).toBe(10);expect(r.payableHours).toBe(8);});
 it('reports exact amount differences',()=>{expect(reconcileInvoice({...doc,amountCents:65000},data,[doc]).differenceCents).toBe(1000);});
 it('does not assume missing GST means zero',()=>expect(reconcileInvoice({...doc,gst:''},data,[doc]).status).toBe('review'));
 it('blocks source duplicates and overlapping revisions',()=>{expect(reconcileInvoice({...doc,duplicateOf:'original'},data,[doc]).status).toBe('review');expect(reconcileInvoice(doc,data,[doc,{...doc,id:'revision'}]).status).toBe('review');});
 it('requires exact supplier identity and complete loaded dates',()=>{expect(reconcileInvoice({...doc,name:'Different Person'},data,[doc]).status).toBe('review');expect(reconcileInvoice(doc,{...data,from:'2026-09-15'},[doc]).expectedFeeCents).toBeNull();});
 it('selects the effective client-specific contractor rate',()=>{const rates=[...data.rates,{...data.rates[0],id:'override',clientId:'c',hourlyRateCents:9000,effectiveFrom:'2026-09-14'}];expect(reconcileInvoice(doc,{...data,rates},[doc]).expectedFeeCents).toBe(72000);});
 it('rejects invalid work dates without using issue dates',()=>{expect(invoicePeriod('31/09/2026 to 01/10/2026')).toBeNull();expect(invoicePeriod('2026-09-14 to 2026-09-19')).toEqual({from:'2026-09-14',to:'2026-09-19'});});
});
