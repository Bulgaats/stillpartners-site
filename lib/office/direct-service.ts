import 'server-only';
import {createServerSupabaseClient,createServiceRoleSupabaseClient} from '@/lib/supabase/server';
import {officeData} from './data';
import {documentRecords} from './document-data';
import {companyRecords} from './company-record-data';
import {directory,contactText} from './foundation';
import {invoiceSnapshotSchema} from './invoice-snapshot';
import {invoiceState,type InvoiceEvent} from './invoice-events';
import {invoicePeriod,reconcileInvoice} from './reconciliation';
import {getPerthIsoDate,addIsoDays} from '@/lib/operations/dates';
import {searchHostedMail,readHostedMail} from './hosted-mail';
import {directRequest,directReply,DIRECT_LABELS,type DirectRequest,type DirectResult,type DirectRow} from './direct';
import {safeDocumentUrl} from './documents';

const fmt=(c:number|null)=>c===null?'Not stated':new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(c/100);
const includes=(text:string,q:string)=>text.toLocaleLowerCase().includes(q.trim().toLocaleLowerCase());
function slice(rows:DirectRow[],cursor:string){const n=cursor?Number(cursor):0;if(!Number.isSafeInteger(n)||n<0||n>100000)throw new Error('Invalid page');return {rows:rows.slice(n,n+20),total:rows.length,nextCursor:n+20<rows.length?String(n+20):null};}

/** One read-only domain surface for Bobby, the phone controls and future workers.
 * Caller must establish the current finance-admin session. Database reads use RLS. */
export async function executeOfficeRead(owner:string,input:DirectRequest):Promise<DirectResult>{
 const request=directRequest.parse(input),{kind,query,cursor}=request,today=getPerthIsoDate();
 const base={request,title:DIRECT_LABELS[kind],checkedAt:new Date().toISOString(),coverage:'Current saved company records. No approval, payment or outgoing message was changed.'};
 if(kind==='mail'){
  const epoch=(day:string)=>Math.floor(Date.parse(day+'T00:00:00+08:00')/1000);
  const q=[query||(!request.from&&!request.to?'newer_than:14d':''),request.from?`after:${epoch(request.from)}`:'',request.to?`before:${epoch(addIsoDays(request.to,1))}`:''].filter(Boolean).join(' ');
  const result=await searchHostedMail(owner,q,cursor);
  return {...base,rows:result.items.map(m=>({id:m.id,title:m.subject||'(No subject)',detail:`${m.from}\n${m.receivedAt}`,source:m.source,next:directRequest.parse({kind:'message',id:m.id})})),total:result.items.length,nextCursor:result.nextPageToken||null,coverage:`Live Gmail · ${q} · This page only. Includes incoming, Sent and self-addressed mail. Open a message to read its body and attachments.`};
 }
 if(kind==='message'){
  const m=await readHostedMail(owner,request.id);
  return {...base,title:m.subject||'(No subject)',body:m.body,bodyFormat:m.bodyFormat,rows:[{id:m.id,title:m.from,detail:`To: ${m.to}\nReceived: ${m.receivedAt}`,source:m.source,files:m.attachments.map(a=>({id:a.partId,label:a.filename||'Inline image',url:`/api/office/gmail/attachment?id=${encodeURIComponent(m.id)}&part=${encodeURIComponent(a.partId)}`}))}],total:1,nextCursor:null,coverage:`Live Gmail message. ${m.bodyFormat==='html'?'HTML is shown as source text for safety. ':''}${m.bodyTruncated?'Body exceeds the display limit; open the original for the remainder. ':''}Attachments have not been interpreted. Opening a PDF is not an invoice check.`};
 }
 const db=await createServerSupabaseClient();
 if(kind==='company'){
  const records=await companyRecords();
  return {...base,...slice(records.filter(r=>includes([r.title,r.body,r.next_action,r.source_ref].join(' '),query)).map(r=>({id:r.id,title:r.title,detail:`${r.kind} · ${r.status}\n${r.body}\nNext: ${r.next_action||'—'}`})),cursor)};
 }
 if(kind==='documents'){
  const [docs,data]=await Promise.all([documentRecords(),officeData(true,today,today)]);
  const matching=directory(data.contractors,query);const ids=new Set(matching.map(p=>p.id));
  const rows=docs.filter(d=>d.status==='active'&&(includes([d.title,d.category,d.notes,d.source_note].join(' '),query)||!!d.entity_id&&ids.has(d.entity_id))).map(d=>({id:d.id,title:d.title,detail:`${d.entity_type==='company'?'Still Partners':data.contractors.find(p=>p.id===d.entity_id)?.fullName??data.clients.find(p=>p.id===d.entity_id)?.name??'Related record'} · ${d.category}\n${d.expires_on?`Expiry: ${d.expires_on}${d.expiry_confirmed?'':' (unverified)'}\n`:''}${d.source_note}`,source:safeDocumentUrl(d.source_url)??undefined,files:(d.files??[]).map(f=>({id:f.id,label:f.filename,url:`/api/office/documents/file?id=${f.id}`}))}));
  return {...base,...slice(rows,cursor),coverage:'Current document catalogue. Private files and Gmail sources open without the Mac. A folder reference alone cannot be opened while the Mac is off.'};
 }
 if(kind==='contacts'||kind==='work'){
  const from=request.from||today,to=request.to||today,data=await officeData(true,from,to),people=directory(data.contractors,query);
  if(kind==='contacts')return {...base,...slice(people.map(p=>({id:p.id,title:p.shortName?`${p.shortName} · ${p.fullName}`:p.fullName,detail:`${p.active?'Active':'Inactive'} · ${p.group}\n${p.phone||'Phone not recorded'}\n${p.email||'Email not recorded'}\nABN ${p.abn||'Not recorded'}`,copy:contactText(p)})),cursor)};
  const ids=new Set(people.map(p=>p.id));
  const rows=data.entries.filter(e=>ids.has(e.workerId)).sort((a,b)=>a.workDate.localeCompare(b.workDate)||a.workerId.localeCompare(b.workerId)).map(e=>{const site=data.projects.find(p=>p.id===e.jobId);return {id:e.id,title:`${e.workDate} · ${new Date(e.workDate+'T00:00:00Z').toLocaleDateString('en-AU',{weekday:'long',timeZone:'UTC'})} · ${data.contractors.find(p=>p.id===e.workerId)?.shortName||data.contractors.find(p=>p.id===e.workerId)?.fullName}`,detail:`${site?.name??'Site unavailable'} · ${data.clients.find(c=>c.id===site?.clientId)?.name??''}\nActual ${e.actualHours}h · Payable ${e.contractorHours??'unknown'}h · Client billable ${e.clientHours??'unknown'}h\n${e.agreementNote}`};});
  return {...base,...slice(rows,cursor),coverage:`Saved work ${from} to ${to}. Missing rows do not mean zero work. Actual, payable and client-billable hours are separate.`};
 }
 const {data:saved,error}=await db.from('office_invoice_snapshots').select('payload').order('exported_at',{ascending:false}).limit(1).maybeSingle();
 if(error)throw new Error('Invoice register could not be loaded');
 const snapshot=saved?invoiceSnapshotSchema.parse(saved.payload):null;
 if(!snapshot)return {...base,rows:[],total:0,nextCursor:null,coverage:'No imported invoice register. Live Gmail remains available; source extraction/import requires the Mac.'};
 if(kind==='check_invoice'){
  const doc=snapshot.documents.find(d=>d.id===request.id);if(!doc)throw new Error('Invoice not found');
  const period=invoicePeriod(doc.workPeriod),data=await officeData(true,period?.from??today,period?.to??today),result=reconcileInvoice(doc,data,snapshot.documents);
  return {...base,title:`${doc.name} · ${doc.invoiceNumber}`,status:result.status,issues:result.issues,rows:[{id:doc.id,title:result.message,source:doc.source,detail:`Work period: ${doc.workPeriod}\nSource: ${fmt(doc.amountCents)} · Expected: ${fmt(result.expectedTotalCents)} · Difference: ${fmt(result.differenceCents)}\nSource billing tonnes: ${result.sourceTonnes??'Not stated'} · Expected: ${result.expectedBillingTonnes??'Not available'}\nActual hours: ${result.actualHours??'Not available'} · Payable hours: ${result.payableHours??'Not available'}`,next:directRequest.parse({kind:'work',query:doc.name,from:period?.from??today,to:period?.to??today})}],total:1,nextCursor:null,coverage:`Deterministic comparison, no AI. Invoice snapshot: ${snapshot.exportedAt}; current work/rates for ${period?.from??'?'}–${period?.to??'?'}. Attendance completeness and official ABN ownership are not verified. A match does not approve or mark paid.`};
 }
 const data=await officeData(true,today,today),people=directory(data.contractors,query),identities=new Set(people.map(p=>`${p.fullName.toLocaleLowerCase()}|${p.abn.replace(/\s/g,'')}`));
 const events:InvoiceEvent[]=[];for(let offset=0;;offset+=500){const r=await db.from('office_invoice_events').select('*').order('id').range(offset,offset+499);if(r.error)throw new Error('Payment events unavailable');events.push(...r.data as InvoiceEvent[]);if(r.data.length<500)break;}
 const docs=snapshot.documents.filter(d=>d.recordType==='invoice'&&(includes([d.name,d.abn,d.invoiceNumber].join(' '),query)||identities.has(`${d.name.toLocaleLowerCase()}|${d.abn.replace(/\s/g,'')}`))).filter(d=>{if(!request.from&&!request.to)return true;const p=invoicePeriod(d.workPeriod);return !!p&&(!request.from||p.to>=request.from)&&(!request.to||p.from<=request.to);}).sort((a,b)=>b.received.localeCompare(a.received)||a.id.localeCompare(b.id));
 return {...base,...slice(docs.map(d=>({id:d.id,title:`${d.name} · ${d.invoiceNumber}`,detail:`${d.workPeriod||'Work period missing'}\n${fmt(d.amountCents)} · Billing tonnes ${d.tonnage||'Not stated'} · GST ${d.gst||'Not stated'}\nReceived: ${d.received||'Not recorded'} · ${events.some(e=>e.kind==='void'&&d.payments.some(p=>p.id===e.target_id))?'Payment reversal awaiting snapshot refresh':invoiceState(d,snapshot.sourceDigest,events).status}\n${d.flags.join('; ')}`,source:d.source,next:directRequest.parse({kind:'check_invoice',id:d.id})})),cursor),coverage:`Saved invoice register: ${snapshot.exportedAt}. Ordered by received date; dates filter work periods. Not a live Gmail import. Revisions and duplicates remain separate.`};
}

export async function processDirectTask(owner:string,id:string){
 const db=createServiceRoleSupabaseClient();if(!db)throw new Error('Server connection unavailable');
 const claim=await db.rpc('office_direct_exchange',{p_owner:owner,p_request:{action:'claim',id}});if(claim.error)throw new Error('Request could not be claimed');const task=claim.data;if(!task?.id)return;
 let response:unknown,status='done';
 try{response=directReply(await executeOfficeRead(owner,directRequest.parse(task.context.directRequest)));}
 catch{status='error';response=directReply({request:task.context.directRequest,title:'This read could not finish. Retry from Office tools; no company changes were made.',checkedAt:new Date().toISOString(),coverage:'No completed result is confirmed.',rows:[],total:0,nextCursor:null});}
 const done=await db.rpc('office_direct_exchange',{p_owner:owner,p_request:{action:'complete',id,lease_id:task.lease_id,status,response}});if(done.error||!done.data?.ok)throw new Error('Result could not be saved');
}
