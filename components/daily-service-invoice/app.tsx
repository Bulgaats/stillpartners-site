"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, Share2, Trash2, FileText } from "lucide-react";
import { blankLine, lineAmountCents, calculateServiceInvoice, dailyServiceSchema, HISTORY_KEY, MAX_LINES, moneyText, newInvoice, restoreDraft, STORAGE_KEY, type DailyServiceInvoice, type SavedServiceInvoice, type ServiceLine } from "@/lib/daily-service-invoice/model";
import { serviceInvoicePdf } from "@/lib/daily-service-invoice/pdf";

export function DailyServiceInvoiceApp(){
  const [invoice,setInvoice]=useState<DailyServiceInvoice|null>(null);
  const [history,setHistory]=useState<SavedServiceInvoice[]>([]);
  const [errors,setErrors]=useState<string[]>([]);
  const [status,setStatus]=useState("");
  const [storageWarning,setStorageWarning]=useState("");
  const [busy,setBusy]=useState(false);
  const [profileOpen,setProfileOpen]=useState(true);
  const [confirmNew,setConfirmNew]=useState(false);
  const [removed,setRemoved]=useState<{line:ServiceLine; index:number}|null>(null);
  const working=useRef(false);
  useEffect(()=>{
    let draft:DailyServiceInvoice|null=null;
    try{draft=restoreDraft(JSON.parse(localStorage.getItem(STORAGE_KEY)??"null"));}catch{setStorageWarning("Local storage is unavailable. Keep a downloaded copy before leaving.");}
    setInvoice(draft??newInvoice());
    setProfileOpen(!draft?.profile.fullName);
    try {const saved:unknown=JSON.parse(localStorage.getItem(HISTORY_KEY)??"[]");if(Array.isArray(saved))setHistory(saved.filter((r):r is SavedServiceInvoice=>r&&typeof r.savedAt==="string"&&dailyServiceSchema.safeParse(r.invoice).success).slice(0,20));}catch{/* History is optional. */}
  },[]);
  useEffect(()=>{if(!invoice)return;try{localStorage.setItem(STORAGE_KEY,JSON.stringify(invoice));}catch{setStorageWarning("Changes cannot be saved on this device. Download your PDF before leaving.");}},[invoice]);
  if(!invoice)return <main className="p-6">Loading invoice form...</main>;
  const totals=calculateServiceInvoice(invoice);
  const update=(patch:Partial<DailyServiceInvoice>)=>{setInvoice({...invoice,...patch});setStatus("");};
  const profile=(key:keyof DailyServiceInvoice["profile"],value:string|boolean)=>update({profile:{...invoice.profile,[key]:value}});
  const changeLine=(id:string,patch:Partial<ServiceLine>)=>update({lines:invoice.lines.map(row=>row.id===id?{...row,...patch}:row)});
  const remember=(value:DailyServiceInvoice)=>{
    const next=[{savedAt:new Date().toISOString(),invoice:structuredClone(value)},...history.filter(r=>r.invoice.invoiceNumber!==value.invoiceNumber)].slice(0,20);
    setHistory(next);try{localStorage.setItem(HISTORY_KEY,JSON.stringify(next));}catch{setStorageWarning("PDF generated, but history could not be saved. Keep your downloaded file.");}
  };
  async function exportPdf(action:"download"|"share",source=invoice){
    if(!source||working.current)return;
    const checked=dailyServiceSchema.safeParse(source);
    if(!checked.success){setErrors(checked.error.issues.map(issue=>`${issue.path.join(" → ")}: ${issue.message}`));setStatus("Please check the highlighted details below.");return;}
    setErrors([]);working.current=true;setBusy(true);setStatus("");
    try{
      const bytes=serviceInvoicePdf(checked.data);
      const blob=new Blob([bytes as BlobPart],{type:"application/pdf"});
      const filename=`invoice-${checked.data.invoiceNumber}.pdf`;
      if(action==="share"){
        const file=new File([blob],filename,{type:"application/pdf"});
        if(!navigator.share||!navigator.canShare?.({files:[file]})){setStatus("File sharing is unavailable in this browser. Use Download PDF, then attach it to your email.");return;}
        await navigator.share({files:[file],title:`Invoice ${checked.data.invoiceNumber}`});
        remember(checked.data);setStatus("Share sheet completed. Check your email app to confirm sending.");
      }else{
        const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
        remember(checked.data);setStatus("PDF download started. Nothing has been emailed automatically.");
      }
    }catch(e){setStatus(e instanceof Error&&e.name==="AbortError"?"Sharing cancelled. Your invoice is unchanged.":"PDF could not be created. Please try again.");}finally{working.current=false;setBusy(false);}
  }
  async function copy(value:string,label:string){try{await navigator.clipboard.writeText(value);setStatus(`${label} copied.`);}catch{setStatus(`Copy unavailable. Select and copy: ${value}`);}}
  return <main className="min-h-dvh bg-slate-100 px-4 py-6 text-slate-950">
    <div className="mx-auto grid max-w-3xl gap-5">
      <header className="rounded-2xl bg-slate-950 p-5 text-white">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-slate-300">Still Partners</p><h1 className="mt-1 text-2xl font-black">Daily service invoice</h1></div><FileText aria-hidden className="mt-1 size-7"/></div>
        <p className="mt-3 text-sm text-slate-200">For one-off or short subcontract services. Add only the days you provided services.</p>
      </header>
      
      {storageWarning&&<p role="alert" className="rounded-lg bg-amber-100 p-3 text-sm">{storageWarning}</p>}
      <details className="rounded-xl border bg-white p-4" open={profileOpen} onToggle={e=>setProfileOpen(e.currentTarget.open)}>
        <summary className="cursor-pointer font-bold">Your details {invoice.profile.fullName?`· ${invoice.profile.fullName}`:"· required"}</summary>
        <p className="mt-2 text-xs text-slate-500">Saved only in this browser, separately from the regular invoice app. PDF details use English / Latin characters.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Full name / business name" value={invoice.profile.fullName} onChange={v=>profile("fullName",v)} maxLength={70}/>
          <Field label="ABN" value={invoice.profile.abn} onChange={v=>profile("abn",v)} maxLength={17}/>
          <Field label="Phone" value={invoice.profile.phone} onChange={v=>profile("phone",v)} maxLength={30}/>
          <Field label="Email" type="email" value={invoice.profile.email} onChange={v=>profile("email",v)} maxLength={80}/>
          <Field label="Bank name" value={invoice.profile.bankName} onChange={v=>profile("bankName",v)} maxLength={60}/>
          <Field label="BSB" value={invoice.profile.bsb} onChange={v=>profile("bsb",v)} maxLength={7}/>
          <Field label="Account number" value={invoice.profile.accountNumber} onChange={v=>profile("accountNumber",v)} maxLength={12}/>
          <label className="flex min-h-12 items-center gap-3 font-bold"><input type="checkbox" className="size-5" checked={invoice.profile.gstRegistered} onChange={e=>profile("gstRegistered",e.target.checked)}/> GST registered</label>
        </div>
      </details>
      <section className="rounded-xl border bg-white p-4"><h2 className="font-bold">Invoice details</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Invoice number" value={invoice.invoiceNumber} onChange={v=>update({invoiceNumber:v})} maxLength={40}/>
        <div className="rounded-lg bg-slate-50 p-3 text-sm"><strong>Bill to: Still Partners Pty Ltd</strong><br/>ABN 62 687 072 420<br/>work@stillpartners.net</div>
        <Field label="Issue date" type="date" value={invoice.issueDate} onChange={v=>update({issueDate:v})}/>
        <Field label="Due date" type="date" value={invoice.dueDate} onChange={v=>update({dueDate:v})}/>
      </div></section>
      <section className="rounded-xl border bg-white p-4" aria-label="Daily services"><h2 className="mb-3 font-bold">Service days</h2>
        <div className="divide-y">{invoice.lines.map((row,index)=><article key={row.id} className="py-3 first:pt-0" aria-label={`Service row ${index+1}`}>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-end gap-2"><Field label="Service date" type="date" value={row.date} onChange={v=>changeLine(row.id,{date:v})}/><Field label="Project / site" value={row.site} onChange={v=>changeLine(row.id,{site:v})} maxLength={70}/><button type="button" disabled={invoice.lines.length===1||busy} onClick={()=>{setRemoved({line:row,index});update({lines:invoice.lines.filter(x=>x.id!==row.id)});}} className="mb-1 rounded-lg py-3 text-slate-500 disabled:opacity-20" aria-label={`Remove service ${index+1}`}><Trash2 className="mx-auto size-4"/></button></div>
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-end gap-2"><Field label="Rate / tonne" value={row.pricingMode==="tonnage"?row.amount:""} onChange={v=>changeLine(row.id,{amount:v,pricingMode:"tonnage"})} numeric/><Field label="Tonnes" value={row.tonnes} onChange={v=>changeLine(row.id,{tonnes:v})} numeric/><div className="pb-3 text-right"><p className="text-xs text-slate-500">AUD ex GST</p><p className="break-words text-sm font-bold">{moneyText(lineAmountCents(row)/100)}</p></div></div>
          {row.pricingMode!=="tonnage"&&<p className="mt-2 text-xs text-amber-800">Previous fixed charge: {moneyText(Number(row.amount))} (unchanged). Enter the agreed rate per tonne to replace it.</p>}
          <details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer">Service description</summary><div className="mt-2"><Field label="Description" value={row.description} onChange={v=>changeLine(row.id,{description:v})} maxLength={100}/></div></details>
        </article>)}</div>
        {invoice.lines.length<MAX_LINES&&<div className="border-t border-dashed pt-3"><Field label="Next service date (optional)" type="date" value="" onChange={v=>{if(!v)return;const previous=invoice.lines.at(-1)!;update({lines:[...invoice.lines,{...blankLine(v),site:previous.site,description:previous.description,amount:previous.pricingMode==="tonnage"?previous.amount:""}]});}}/></div>}
        {removed&&<p className="mt-2 text-xs text-slate-600">Day removed. <button className="font-bold underline" type="button" disabled={invoice.lines.length>=MAX_LINES} onClick={()=>{const lines=[...invoice.lines];lines.splice(removed.index,0,removed.line);update({lines});setRemoved(null);}}>Undo</button></p>}
      </section>
      <section className="rounded-xl bg-white p-4 shadow-sm"><h2 className="font-bold">Invoice summary</h2><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><span>Service period</span><span className="text-right">{totals.periodStart} – {totals.periodEnd}</span><span>Recorded production</span><span className="text-right">{totals.hasTonnes?`${totals.tonnes.toFixed(3)} tonnes`:"Not recorded"}</span><span>Subtotal</span><span className="text-right">{moneyText(totals.subtotal)}</span><span>{invoice.profile.gstRegistered?"GST 10%":"GST (not registered)"}</span><span className="text-right">{moneyText(totals.gst)}</span><strong className="border-t pt-3 text-lg">Total AUD</strong><strong className="border-t pt-3 text-right text-lg">{moneyText(totals.total)}</strong></div></section>
      {!!errors.length&&<div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800"><p className="font-bold">Please correct these details:</p><ul className="mt-2 list-inside list-disc">{errors.map((e,i)=><li key={i}>{e}</li>)}</ul></div>}
      <div className="grid grid-cols-2 gap-3"><button className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 font-bold text-white disabled:opacity-50" disabled={busy} onClick={()=>void exportPdf("download")}><Download className="size-4"/>Download PDF</button><button className="flex min-h-12 items-center justify-center gap-2 rounded-xl border bg-white px-3 font-bold disabled:opacity-50" disabled={busy} onClick={()=>void exportPdf("share")}><Share2 className="size-4"/>Share PDF</button></div>
      {status&&<p role="status" className="rounded-lg bg-blue-50 p-3 text-sm">{status}</p>}
      <section className="rounded-xl border bg-white p-4 text-sm"><p>Download or share the PDF, then send it from your own email to <strong>work@stillpartners.net</strong>.</p><p className="mt-2 text-xs text-slate-500">The PDF is created on your device. No invoice, profile or bank data is uploaded. Creating or downloading a PDF does not send an email.</p><div className="mt-3 flex flex-wrap gap-3"><button type="button" className="rounded-lg border px-3 py-2 font-bold" onClick={()=>void copy("work@stillpartners.net","Email")}>Copy email</button><button type="button" className="rounded-lg border px-3 py-2 font-bold" onClick={()=>void copy(window.location.origin+"/contractor-invoice/daily-services","Form link")}>Copy form link</button><button type="button" className="rounded-lg border px-3 py-2 font-bold" onClick={()=>setConfirmNew(true)}>Start new invoice</button></div></section>
      {confirmNew&&<section className="rounded-xl border border-amber-300 bg-amber-50 p-4" role="alert"><p className="font-bold">Start a new invoice?</p><p className="mt-1 text-sm">This clears the current service rows. Your details and downloaded invoice history stay on this device.</p><div className="mt-3 flex gap-3"><button className="rounded-lg bg-slate-950 px-4 py-2 text-white" onClick={()=>{setInvoice(newInvoice(invoice.profile));setConfirmNew(false);setRemoved(null);setErrors([]);setStatus("New invoice ready.");}}>Start new</button><button className="rounded-lg border px-4 py-2" onClick={()=>setConfirmNew(false)}>Cancel</button></div></section>}
      <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer font-bold">Downloaded / shared history ({history.length})</summary><p className="mt-2 text-xs text-slate-500">Last 20 generated invoices on this device. This is not a record of email delivery or payment.</p><div className="mt-3 grid gap-2">{history.map(r=><div key={r.invoice.invoiceNumber} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm"><span>{r.invoice.invoiceNumber}<br/>{moneyText(calculateServiceInvoice(r.invoice).total)}</span><button disabled={busy} className="rounded-lg border px-3 py-2 font-bold" onClick={()=>void exportPdf("download",r.invoice)}>Download again</button></div>)}</div></details>
      <footer className="pb-5 text-center text-xs text-slate-500"><Link href="/contractor-invoice" className="underline">Regular contractor invoice app</Link><p className="mt-2">Use the actual agreed service charge and genuine production figures. Do not estimate tonnes from time.</p></footer>
    </div>
  </main>;
}
function Field({label,value,onChange,type="text",maxLength,numeric=false}:{label:string;value:string;onChange:(v:string)=>void;type?:string;maxLength?:number;numeric?:boolean}){return <label className="grid gap-1 text-xs font-bold text-slate-700">{label}<input className="min-h-12 min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal text-slate-950 focus:border-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-200" type={type} inputMode={numeric?"decimal":undefined} value={value} maxLength={maxLength??100} onChange={e=>onChange(e.target.value)}/></label>;}
