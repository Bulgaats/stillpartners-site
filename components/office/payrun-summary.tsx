'use client';
import type {OfficeData} from '@/lib/office/foundation';
import type {InvoiceSnapshot} from '@/lib/office/invoice-snapshot';
import {contractorForInvoice,payrunSummary,invoiceInPayrun} from '@/lib/office/payrun';
export function PayrunSummary({data,documents,from,to,payday}:{data:OfficeData;documents:InvoiceSnapshot['documents'];from:string;to:string;payday:string}){
 const summary=payrunSummary(data,from,to),loaded=data.from<=from&&data.to>=to;
 return <details className="ember-panel office-work-summary" open><summary><strong>Work summary · {from} – {to}</strong></summary>
 <p className="ember-footnote">Payday {payday} · Recorded work only. Missing entries are not zero hours. Actual and payable hours are shown separately.</p>
 {!loaded&&<p className="ember-notice">This period is not fully loaded. <a className="ember-link" href={`/office?view=invoices&from=${from}&to=${to}&payday=${payday}`}>Load this work period</a></p>}
 {loaded&&<>{summary.map(person=>{
 const invoices=documents.filter(d=>d.recordType==='invoice'&&!d.duplicateOf&&contractorForInvoice(d,data)?.id===person.id&&invoiceInPayrun(d,from,to));
 return <details className="ember-panel" key={person.id}><summary><strong>{person.name}</strong> · {person.actualHours} actual h · {person.payableHours??'Unknown'} payable h · {invoices.length} invoices</summary>
 {!invoices.length&&<p className="ember-notice">No invoice matched to this full name, ABN and work period. Check late arrivals or identity differences.</p>}
 <div className="office-summary-scroll"><table className="office-summary-table"><thead><tr><th>Date</th><th>Client / Site</th><th>Actual h</th><th>Payable h</th></tr></thead><tbody>{person.rows.map(row=><tr key={row.id}><td>{row.workDate}</td><td>{row.client}<br/>{row.site}{row.agreementNote&&<small>{row.agreementNote}</small>}</td><td>{row.actualHours}</td><td>{row.contractorHours??'Unknown'}</td></tr>)}</tbody><tfoot><tr><th colSpan={2}>Total</th><td>{person.actualHours}</td><td>{person.payableHours??'Unknown'}</td></tr></tfoot></table></div>
 </details>;
 })}{!summary.length&&<p className="ember-notice">No work entries are recorded for this period. Invoice dates are not used to invent work hours or sites.</p>}</>}
 </details>;
}
