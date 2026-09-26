"use client";
import { useState, type ReactNode } from 'react';
import { resolveOfficeContactImport, type OfficeResult } from '@/app/actions/office';
import { gmailSourceUrl, possibleContacts, type ContactImport } from '@/lib/office/contact-import';
import { directory, validAbn, type Contractor } from '@/lib/office/foundation';

const button='dashboard-button dashboard-button-primary';
const secondary='dashboard-button dashboard-button-outline';
function Field({label,children}:{label:string;children:ReactNode}) {
  return <label className="grid gap-1.5 text-sm font-semibold text-slate-700">{label}{children}</label>;
}
type Run=(action:()=>Promise<OfficeResult>)=>void;
export function ContactImportReview({items,people,pending,run}:{items:ContactImport[];people:Contractor[];pending:boolean;run:Run}) {
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('pending');
  const [selected,setSelected]=useState<string|null>(null);
  const query=search.toLowerCase().trim();
  const filtered=items.filter(i=>(filter==='all'||i.status===filter)&&[i.source.name,i.source.abn,...i.source.emails,...i.source.phones].join(' ').toLowerCase().includes(query))
    .sort((a,b)=>a.source.name.localeCompare(b.source.name,'en-AU'));
  const current=items.find(i=>i.id===selected);
  const pendingCount=items.filter(i=>i.status==='pending').length;
  return <section className="dashboard-card">
    <h2 className="dashboard-card-title">Review contacts from invoices</h2>
    <p className="mt-2 max-w-3xl text-sm text-slate-600">{pendingCount} awaiting review. These are source observations, not confirmed contractors. Compare the original details, then add a contact, link an existing contact, or exclude the source.</p>
    <div className="my-5 grid gap-3 sm:grid-cols-2">
      <Field label="Find source contact"><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, ABN, phone or email"/></Field>
      <Field label="Review status"><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="pending">Awaiting review</option><option value="created">Added to directory</option><option value="linked">Linked to existing contact</option><option value="dismissed">Excluded</option><option value="all">All sources</option></select></Field>
    </div>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,1fr)]">
      <div className="max-h-[75vh] overflow-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[480px] text-left text-sm"><thead className="sticky top-0 z-10 bg-slate-100"><tr>{['Source name / ABN','Documents','Action'].map(h=><th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>
          {filtered.map(item=><tr className={`border-t ${selected===item.id?'bg-blue-50':''}`} key={item.id}>
            <td className="p-3"><strong className="block text-blue-950">{item.source.name||'Supplier not extracted'}</strong><span className="text-xs text-slate-500">{item.source.abn||'ABN missing'}</span><span className="mt-1 block text-xs text-amber-800">{item.source.issues.length} review notes · {item.status}</span></td>
            <td className="p-3">{item.source.documentCount}</td><td className="p-3"><button type="button" className={secondary} onClick={()=>setSelected(item.id)}>{item.status==='pending'?'Review':'View'}</button></td>
          </tr>)}
        </tbody></table>{!filtered.length?<p className="p-5 text-slate-500">No sources match this filter.</p>:null}
      </div>
      {current?<ReviewForm key={current.id+current.status} item={current} people={people} pending={pending} run={run}/>:<div className="rounded-xl border border-dashed p-6 text-slate-500">Choose a source to compare its details. Different names sharing an ABN stay separate until reviewed.</div>}
    </div>
  </section>;
}
function ReviewForm({item,people,pending,run}:{item:ContactImport;people:Contractor[];pending:boolean;run:Run}) {
  const s=item.source;
  const [action,setAction]=useState<'create'|'link'|'dismiss'>('create');
  const [name,setName]=useState(s.name);
  const [abn,setAbn]=useState(s.abn);
  const [email,setEmail]=useState(s.emails.length===1?s.emails[0]:'');
  const [phone,setPhone]=useState(s.phones.length===1?s.phones[0]:'');
  const [group,setGroup]=useState('');
  const [active,setActive]=useState(true);
  const [worker,setWorker]=useState('');
  const [note,setNote]=useState('');
  const hints=possibleContacts(s,people);
  const links=s.sources.map(ref=>({...ref,safeUrl:gmailSourceUrl(ref.url)})).filter(ref=>ref.safeUrl);
  return <div className="rounded-xl border border-slate-200 p-5">
    <h3 className="text-lg font-bold text-blue-950">Original source details</h3>
    <dl className="mt-4 grid gap-x-3 gap-y-2 text-sm sm:grid-cols-[95px_1fr]">
      <dt className="text-slate-500">Name(s)</dt><dd className="break-words">{s.names.join(' · ')||s.name||'Missing'}</dd>
      <dt className="text-slate-500">ABN(s)</dt><dd>{s.abns.join(' · ')||'Missing'}</dd>
      <dt className="text-slate-500">Email(s)</dt><dd className="break-all">{s.emails.join(' · ')||'Missing'}</dd>
      <dt className="text-slate-500">Phone(s)</dt><dd>{s.phones.join(' · ')||'Missing'}</dd>
    </dl>
    {s.issues.length?<ul className="my-4 list-disc space-y-1 rounded-lg bg-amber-50 p-4 pl-8 text-sm text-amber-950">{s.issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul>:null}
    <div className="my-4 flex flex-wrap gap-2">{links.map((ref,i)=><a key={`${ref.documentId}:${i}`} className="text-sm font-semibold text-blue-700 underline" href={ref.safeUrl!} target="_blank" rel="noopener noreferrer">Source {ref.invoiceNumber||ref.documentId}{ref.workPeriod?` · ${ref.workPeriod}`:''}</a>)}</div>
    <details className="mb-4 text-xs text-slate-500"><summary>Source document references ({s.documentIds.length})</summary><p className="mt-2 break-words">{s.documentIds.join(', ')||item.sourceKey}</p></details>
    {item.status!=='pending'?<div className="rounded-lg bg-emerald-50 p-4 text-sm"><p className="font-bold">Review completed: {item.status}</p><p className="mt-1">{people.find(p=>p.id===item.workerId)?.fullName}</p><p className="mt-2">{item.reviewNote}</p></div>:<form className="grid gap-4 border-t pt-5" onSubmit={e=>{
      e.preventDefault();
      run(()=>resolveOfficeContactImport({id:item.id,action,note,workerId:action==='link'?worker:null,contact:action==='create'?{fullName:name,email,phone,abn,group:group as 'regular'|'occasional',active}:null}));
    }}>
      {hints.length?<div className="rounded-lg bg-blue-50 p-3 text-sm"><strong>Possible existing contacts — confirm identity:</strong>{hints.map(p=><p className="mt-1" key={p.id}>{p.fullName} · {p.abn||'ABN missing'} · {p.email||'Email missing'}</p>)}</div>:null}
      <Field label="Review action"><select value={action} onChange={e=>setAction(e.target.value as typeof action)}><option value="create">Add a new contractor contact</option><option value="link">Link to an existing contractor</option><option value="dismiss">Exclude this source from the directory</option></select></Field>
      {action==='create'?<>
        <Field label="Full Name"><input required minLength={2} maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></Field>
        <Field label="Supplier ABN"><input value={abn} onChange={e=>setAbn(e.target.value)} placeholder="Leave blank if unconfirmed"/></Field>
        {abn&&(!validAbn(abn)||abn.replace(/\s/g,'')==='62687072420')?<p className="text-sm text-amber-900">This ABN needs correction. Confirm it from the source, or leave the contact ABN blank. The original stays above.</p>:null}
        <Field label="Preferred Email"><input type="email" maxLength={254} list={`emails-${item.id}`} value={email} onChange={e=>setEmail(e.target.value)}/><datalist id={`emails-${item.id}`}>{s.emails.map(x=><option key={x} value={x}/>)}</datalist></Field>
        <Field label="Preferred Phone"><input type="tel" maxLength={40} list={`phones-${item.id}`} value={phone} onChange={e=>setPhone(e.target.value)}/><datalist id={`phones-${item.id}`}>{s.phones.map(x=><option key={x} value={x}/>)}</datalist></Field>
        <Field label="Contractor group"><select required value={group} onChange={e=>setGroup(e.target.value)}><option value="">Choose group</option><option value="regular">Regular Contractor</option><option value="occasional">Occasional Contractor</option></select></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/>Available for new work</label>
      </>:null}
      {action==='link'?<><Field label="Existing contractor"><select required value={worker} onChange={e=>setWorker(e.target.value)}><option value="">Select the confirmed person</option>{directory(people).map(p=><option value={p.id} key={p.id}>{p.fullName} · {p.abn||'ABN missing'}</option>)}</select></Field><p className="text-sm text-slate-600">This links the source only. Update preferred details in Contractors after reviewing any differences.</p></>:null}
      <Field label="Review note"><textarea required minLength={3} maxLength={2000} rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Identity confirmed, preferred contact selected, or reason for excluding"/></Field>
      <button type="submit" className={button} disabled={pending}>{pending?'Saving…':action==='create'?'Confirm and add contact':action==='link'?'Confirm source link':'Exclude source'}</button>
      <p className="text-xs text-slate-500">Contact review does not approve invoices, confirm GST registration, send invitations or record payments.</p>
    </form>}
  </div>;
}
