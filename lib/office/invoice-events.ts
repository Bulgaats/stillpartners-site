import type {InvoiceSnapshot} from './invoice-snapshot';
export type InvoiceEvent={id:string;document_id:string;kind:'approve'|'payment'|'void';source_digest:string;amount_cents:number|null;payment_date:string|null;reason:string;target_id:string|null;created_at:string};
export function invoiceState(d:InvoiceSnapshot['documents'][number],digest:string,events:InvoiceEvent[]){
 const mine=events.filter(e=>e.document_id===d.id);const cancelled=new Set(mine.filter(e=>e.kind==='void').map(e=>e.target_id));
 const payments=mine.filter(e=>e.kind==='payment'&&!cancelled.has(e.id));
 const extra=payments.filter(e=>!d.payments.some(p=>p.id===e.id));const paid=d.paidCents+extra.reduce((n,e)=>n+(e.amount_cents??0),0);
 return {approved:d.approved||mine.some(e=>e.kind==='approve'&&e.source_digest===digest),paid,status:paid>0&&d.amountCents!==null&&paid>=d.amountCents?'Paid':paid>0?'Part-paid':'Unknown',payments,pending:extra.length>0};
}

// Keep acknowledged payments visible while router.refresh is in flight. Persisted
// rows win by ID; void events and Mac snapshot IDs still prevent double counting.
export function mergeConfirmedPayments(events:InvoiceEvent[],confirmed:InvoiceEvent[]){
 const stored=new Set(events.map(e=>e.id));
 return [...events,...confirmed.filter(e=>!stored.has(e.id))];
}
export function invoicePaymentSection(d:InvoiceSnapshot['documents'][number],digest:string,events:InvoiceEvent[]){
 return invoiceState(d,digest,events).status==='Paid'?'paid':'to-pay';
}
