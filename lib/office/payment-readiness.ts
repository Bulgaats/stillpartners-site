import type {OfficeData} from './foundation';
import {validAbn,validDate} from './foundation';
import type {InvoiceSnapshot} from './invoice-snapshot';
import {invoiceState,type InvoiceEvent} from './invoice-events';
import {reconcileInvoice} from './reconciliation';
export type PaymentReadiness={status:'ready'|'review'|'blocked';issues:string[]};
export function paymentReadiness(d:InvoiceSnapshot['documents'][number],data:OfficeData,all:InvoiceSnapshot['documents'],digest:string,events:InvoiceEvent[]):PaymentReadiness{
 const blocked:string[]=[];
 if(d.recordType!=='invoice')blocked.push('This is not a contractor invoice.');
 if(d.duplicateOf)blocked.push('Use the original invoice; this document is a duplicate.');
 if(d.currency!=='AUD'||d.amountCents===null||d.amountCents<=0)blocked.push('A positive AUD invoice amount is required.');
 if(!validAbn(d.abn)||d.abn.replace(/\s/g,'')==='62687072420')blocked.push('Correct the supplier ABN before recording payment.');
 if(d.name.trim().length<2)blocked.push('A supplier name is required.');
 if(blocked.length)return {status:'blocked',issues:blocked};
 const state=invoiceState(d,digest,events);
 if(state.approved)return {status:'ready',issues:[]};
 const r=reconcileInvoice(d,data,all);
 const issues=[...d.flags,...r.issues];
 if(!validDate(d.issueDate))issues.push('Invoice date needs review.');
 if(!d.invoiceNumber.trim())issues.push('Invoice number is missing.');
 if(r.status==='difference')issues.push(r.message);
 if(r.status==='review'&&!r.issues.length)issues.push('Time and rate records need review.');
 return {status:issues.length?'review':'ready',issues:[...new Set(issues)]};
}
