import {describe,it,expect} from 'vitest';
import {reconcileInvoice} from '../lib/office/reconciliation';
import {sourceTonnes,tonnesRateCents} from '../lib/office/tonnage';
import type {OfficeData} from '../lib/office/foundation';
import type {InvoiceSnapshot} from '../lib/office/invoice-snapshot';
const base:OfficeData={finance:true,from:'2026-09-01',to:'2026-09-30',contractors:[{id:'w',fullName:'Example Person',abn:'51824753556',phone:'',email:'',group:'regular',active:true}],clients:[{id:'c',name:'Example client',active:true}],projects:[{id:'s',clientId:'c',name:'Example site',active:true}],rates:[{id:'old',workerId:'w',clientId:null,kind:'contractor',hourlyRateCents:6000,effectiveFrom:'2026-09-01',agreementNote:'Synthetic agreement',voidedAt:null},{id:'new',workerId:'w',clientId:null,kind:'contractor',hourlyRateCents:6500,effectiveFrom:'2026-09-27',agreementNote:'Synthetic increase',voidedAt:null}],entries:['2026-09-26','2026-09-27'].map((d,i)=>({id:'e'+i,workerId:'w',jobId:'s',workDate:d,actualHours:8,contractorHours:10,clientHours:12,agreementNote:'Synthetic agreed allocation',locked:false,updatedAt:''}))};
const doc={id:'d',name:'Example Person',abn:'51824753556',recordType:'invoice',currency:'AUD',workPeriod:'26/09/2026 to 27/09/2026',amountCents:125000,gst:'0',tonnage:'2',flags:[],duplicateOf:''} as unknown as InvoiceSnapshot['documents'][number];
describe('Dated contractor billing-tonne agreement',()=>{
 it('derives $600/tonne from $60/h, and $650/tonne from $65/h',()=>{expect(tonnesRateCents(6000)).toBe(60000);expect(tonnesRateCents(6500)).toBe(65000);});
 it('splits a rate-change period using payable hours on each date',()=>{const r=reconcileInvoice(doc,base,[doc]);expect(r.status).toBe('match');expect(r.expectedFeeCents).toBe(125000);expect(r.expectedBillingTonnes).toBe(2);expect(r.tonneRates.map(x=>x.tonneRateCents)).toEqual([60000,65000]);});
 it('does not reprice old work when the invoice arrives after a rate increase',()=>{const d={...doc,received:'2026-09-28T00:00:00Z',workPeriod:'2026-09-26',tonnage:'1',amountCents:60000};expect(reconcileInvoice(d,base,[d]).status).toBe('match');});
 it('blocks a tonnage discrepancy even when the monetary amount matches',()=>{const r=reconcileInvoice({...doc,tonnage:'3'},base,[doc]);expect(r.status).toBe('review');expect(r.issues.join(' ')).toContain('billing tonnes differ');});
 it('rejects test/NaN quantities instead of silently accepting the money',()=>{for(const v of ['NaN','0','-2','2 + 2','2 tonnes and 1 tonne'])expect(reconcileInvoice({...doc,tonnage:v},base,[doc]).status).toBe('review');});
 it('keeps a source-flagged invoice in review',()=>expect(reconcileInvoice({...doc,flags:['Billed to another company']},base,[doc]).status).toBe('review'));
 it('uses client-specific payable rates and ignores client billing rates',()=>{const rates=[...base.rates,{...base.rates[0],id:'exception',clientId:'c',hourlyRateCents:7000},{...base.rates[0],id:'client',clientId:'c',kind:'client' as const,hourlyRateCents:10000}];expect(reconcileInvoice({...doc,amountCents:140000},{...base,rates},[doc]).status).toBe('match');});
 it('requires dated records and agreed rates instead of guessing a split',()=>{expect(reconcileInvoice(doc,{...base,entries:[]},[doc]).status).toBe('review');expect(reconcileInvoice(doc,{...base,rates:[]},[doc]).status).toBe('review');});
 it('parses explicit quantities conservatively',()=>{expect(sourceTonnes('5.5 tonnes')).toBe(5.5);expect(sourceTonnes('1,000.25')).toBe(1000.25);expect(sourceTonnes('1,2')).toBeNull();});
});
