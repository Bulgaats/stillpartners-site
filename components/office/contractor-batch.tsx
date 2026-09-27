'use client';
import {applyAssistantContractors} from '@/app/actions/assistant';
import type {AssistantResponse,AssistantTask} from '@/lib/office/assistant';
export function ContractorBatch({task,response,pending,run}:{task:AssistantTask;response:AssistantResponse;pending:boolean;run:(action:()=>Promise<{ok:boolean;message:string}>)=>void}){
 const saved=(index:number)=>task.applications?.find(a=>a.proposal_index===index);
 const remaining=response.contractors.filter((_,i)=>!['created','existing'].includes(saved(i)?.status??'')).length;
 return <section className="office-contractor-batch" aria-label="Contractor proposals">
  <div className="office-batch-heading"><div><h3>{response.contractors.length} contractor proposals</h3><p>{response.contractors.length-remaining} registered · {remaining} remaining</p></div>
   <button className="ember-primary" disabled={pending||!remaining} onClick={()=>run(()=>applyAssistantContractors(task.id))}>{pending?'Saving…':remaining?'Create all':'All registered ✓'}</button>
  </div>
  <p className="ember-footnote">Check the details below. You can save everyone together or one person at a time. Existing contacts are kept; identity conflicts are held for review.</p>
  {response.contractors.map((p,i)=>{const result=saved(i),done=result?.status==='created'||result?.status==='existing';return <article key={i} className="office-batch-person">
   <strong>{p.name}</strong><p>{p.email||'Email not available'}<br/>{p.phone||'Phone not available'}<br/>ABN {p.abn||'not available'}</p>
   <small>{p.group==='regular'?'Regular contractor':'Occasional contractor'} · {p.sourceDocumentIds.length?`Invoice sources: ${p.sourceDocumentIds.join(', ')}`:'Owner-provided details'}</small>
   {result&&<p className={result.status==='review'?'error':'muted'} role="status">{result.status==='created'?'Created ✓':result.status==='existing'?'Already registered ✓':'Needs review'} — {result.message}</p>}
   {!done&&<button disabled={pending} onClick={()=>run(()=>applyAssistantContractors(task.id,[i]))}>{result?.status==='review'?'Retry this record':'Create record'}</button>}
  </article>;})}
 </section>;
}
