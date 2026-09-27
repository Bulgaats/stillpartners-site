'use client';
import type {MacReceipt} from '@/lib/office/mac-sync';
import {useEffect,useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {markOfficeInvoicePaid,recordOfficeInvoiceEvent} from '@/app/actions/invoice-events';
import {invoiceState,type InvoiceEvent} from '@/lib/office/invoice-events';
import type {InvoiceSnapshot} from '@/lib/office/invoice-snapshot';
import type {PaymentReadiness} from '@/lib/office/payment-readiness';
const aud=(n:number)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(n/100);
export function InvoicePaymentControls({document:d,digest,events,today,receipts,readiness}:{document:InvoiceSnapshot['documents'][number];digest:string;events:InvoiceEvent[];today:string;receipts:MacReceipt[];readiness:PaymentReadiness}){
 const state=invoiceState(d,digest,events),router=useRouter(),[pending,start]=useTransition();
 const [amountEdit,setAmount]=useState<string|null>(null),[day,setDay]=useState(today),[reference,setReference]=useState(''),[review,setReview]=useState(false),[reviewNote,setReviewNote]=useState(''),[notice,setNotice]=useState(''),[saved,setSaved]=useState(false);
 const [target,setTarget]=useState<string|null>(null),[correction,setCorrection]=useState('');
 const request=useRef<{key:string;id:string;reviewId:string}|null>(null),sending=useRef(false);
 const remaining=Math.max(0,(d.amountCents??0)-state.paid),amount=amountEdit??(remaining/100).toFixed(2);
 const cents=/^\d+(\.\d{1,2})?$/.test(amount)?Math.round(Number(amount)*100):0;
 const valid=cents>0&&cents<=remaining&&day.length===10&&day<=today;
 const mine=events.filter(e=>e.document_id===d.id),localReceipts=receipts.filter(r=>mine.some(e=>e.id===r.event_id));
 useEffect(()=>{setSaved(false);setAmount(null);setReview(false);setReviewNote('');},[state.paid,digest]);
 function markPaid(){
  if(sending.current||!valid||saved||readiness.status==='blocked')return;
  if(readiness.status==='review'&&!review){setReview(true);return;}
  if(readiness.status==='review'&&reviewNote.trim().length<3)return;
  const details={documentId:d.id,digest,amount:cents,day,expectedPaid:state.paid,reference,reviewNote};
  const key=JSON.stringify(details);
  if(request.current?.key!==key)request.current={key,id:crypto.randomUUID(),reviewId:crypto.randomUUID()};
  const value={...details,id:request.current.id,reviewId:request.current.reviewId};
  sending.current=true;start(async()=>{try{const result=await markOfficeInvoicePaid(value);setNotice(result.message);if(result.ok){setSaved(true);setReview(false);router.refresh();}}
   catch{setNotice('Confirmation was interrupted. Retry with the same details to check this payment safely.');}finally{sending.current=false;}});
 }
 function cancelPayment(){
  if(!target||correction.trim().length<3||sending.current)return;
  const value={documentId:d.id,digest,kind:'void',amount:null,day:null,reason:correction,target};
  const key=JSON.stringify(value);if(request.current?.key!==key)request.current={key,id:crypto.randomUUID(),reviewId:crypto.randomUUID()};
  sending.current=true;start(async()=>{try{const result=await recordOfficeInvoiceEvent({...value,id:request.current!.id});setNotice(result.message);if(result.ok){setTarget(null);router.refresh();}}catch{setNotice('Could not confirm correction. Retry the same details.');}finally{sending.current=false;}});
 }
 return <div className="office-paid-controls">
 <p><strong>{state.status==='Unknown'?'Payment not confirmed':state.status}</strong> · Recorded {aud(state.paid)}{d.amountCents!==null&&<> · Remaining {aud(remaining)}</>}</p>
 {state.status!=='Paid'&&readiness.status==='blocked'&&<div className="ember-notice"><strong>Source needs correction</strong><ul>{readiness.issues.map(x=><li key={x}>{x}</li>)}</ul></div>}
 {state.status!=='Paid'&&readiness.status!=='blocked'&&<div className="office-paid-form">
 <div className="office-payment-fields"><label>Amount paid (AUD)<input aria-label="Amount paid (AUD)" inputMode="decimal" value={amount} disabled={pending||saved} onChange={e=>setAmount(e.target.value)}/></label>
 <label>Actual payment date<input aria-label="Actual payment date" type="date" max={today} value={day} disabled={pending||saved} onChange={e=>setDay(e.target.value)}/></label></div>
 <details><summary>Bank reference (optional)</summary><input aria-label="Bank reference" value={reference} maxLength={500} disabled={pending||saved} onChange={e=>setReference(e.target.value)}/></details>
 <p className="ember-footnote">Press Paid after transferring. It confirms {aud(cents)} on {day} for this invoice. For a split payment, change the amount. No bank transfer is made here.</p>
 {readiness.status==='review'&&<p className="ember-notice">Review needed · {readiness.issues[0]}</p>}
 {review&&<div className="ember-panel"><strong>Check these exceptions</strong><ul>{readiness.issues.map(x=><li key={x}>{x}</li>)}</ul><label>Resolution / why payment is correct<textarea aria-label="Review resolution" maxLength={1000} value={reviewNote} disabled={pending} onChange={e=>setReviewNote(e.target.value)}/></label></div>}
 <button className="ember-primary" disabled={pending||saved||!valid||(review&&reviewNote.trim().length<3)} onClick={markPaid}>{pending?'Saving…':saved?'Recorded ✓':review?'Confirm & mark paid':readiness.status==='review'?'Review & mark paid':`Paid · ${aud(cents)}`}</button>
 </div>}
 {state.pending&&<p className="ember-footnote">Payment saved in Office · Mac filing pending.</p>}
 {localReceipts.filter(r=>r.status==='blocked').map(r=><p className="error" key={r.event_id}>Mac filing needs review: {r.message}</p>)}
 {!state.pending&&localReceipts.some(r=>r.status==='applied')&&<p className="ember-footnote">Mac synchronization confirmed{state.status==='Paid'&&localReceipts.some(r=>r.file_state==='paid_verified')?' · Paid file verified':''}.</p>}
 {state.payments.length>0&&<details><summary>Payment history · {state.payments.length}</summary>{state.payments.map(p=><p className="ember-footnote" key={p.id}>{p.payment_date} · {aud(p.amount_cents??0)} · {p.reason} {!d.payments.some(x=>x.id===p.id)&&<button disabled={pending} className="ember-text-button" onClick={()=>{setTarget(p.id);setCorrection('');}}>Correct this entry</button>}</p>)}</details>}
 {target&&<div className="ember-panel"><strong>Cancel an incorrect payment entry</strong><p>Audit history will be retained.</p><label>Correction reason<input value={correction} disabled={pending} maxLength={2000} onChange={e=>setCorrection(e.target.value)}/></label><button disabled={pending||correction.trim().length<3} onClick={cancelPayment}>Confirm cancellation</button><button disabled={pending} onClick={()=>setTarget(null)}>Keep payment</button></div>}
 {notice&&<p role="status" className="ember-notice">{notice}</p>}
 </div>;
}
