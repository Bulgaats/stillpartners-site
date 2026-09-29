'use client';
import {useEffect,useLayoutEffect,useState,useTransition,useRef,useCallback} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {applyContractorNamesTask} from '@/app/actions/contractor-names';
import {CompanyRecordProposalView} from './company-record-proposal';
import {ContractorBatch} from './contractor-batch';
import {MessageSquare,Plus,PanelLeft,ArrowDown,Send,RefreshCw,X,Pencil} from 'lucide-react';
import {submitAssistantTask,listAssistantTasks,listAssistantConversations,renameAssistantConversation,applyAssistantTask} from '@/app/actions/assistant';
import {assistantResponse,directResult,type AssistantTask} from '@/lib/office/assistant';
import {DirectTools,DirectResultView} from './direct-tools';
import {directFromPrompt,DIRECT_LABELS,type DirectRequest} from '@/lib/office/direct';
type Conversation={id:string;title:string;updated_at:string;status:string|null};
type Draft={text:string;requestId:string};
export function AssistantChat({navigate,clients}:{navigate:(section:string)=>void;clients:{id:string;name:string}[]}){
 const router=useRouter(),[tasks,setTasks]=useState<AssistantTask[]>([]),[prompt,setPrompt]=useState(''),[notice,setNotice]=useState(''),[pending,start]=useTransition(),[refreshing,setRefreshing]=useState(false);
 const [conversations,setConversations]=useState<Conversation[]>([]),[selected,setSelected]=useState<string|null>(null),[ready,setReady]=useState(false),[loading,setLoading]=useState(false),[drawer,setDrawer]=useState(false),[more,setMore]=useState(false),[moreChats,setMoreChats]=useState(false),[legacy,setLegacy]=useState(0),[atBottom,setAtBottom]=useState(true);
 const panel=useRef<HTMLElement>(null),scroller=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null),id=useRef(''),selectedRef=useRef<string|null>(null),nearEnd=useRef(true),drafts=useRef<Record<string,Draft>>({}),listLimit=useRef(30),prepend=useRef<{height:number;top:number}|null>(null),initialised=useRef(false);
 const directInFlight=useRef(new Set<string>()),quickRetry=useRef<{key:string;id:string}|null>(null);
 const active=tasks.some(t=>t.status==='queued'||t.status==='running');
 useEffect(()=>{for(const task of tasks.filter(t=>(t.executor==='cloud'||t.executor==='direct')&&(t.status==='queued'||t.status==='running'))){
  if(directInFlight.current.has(task.id))continue;directInFlight.current.add(task.id);
  void fetch('/api/office/assistant/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:task.id})}).then(r=>{if(r.status===503)setNotice('Cloud AI is paused. Office tools still work without it.');}).catch(()=>setNotice('Read interrupted. Your request is saved; reconnect to resume.')).finally(()=>{directInFlight.current.delete(task.id);});
 }},[tasks]);
 const title=selected==='legacy'?'Other requests':conversations.find(c=>c.id===selected)?.title??'New chat';
 const refresh=useCallback(async(manual=false)=>{
  const key=selectedRef.current;if(manual){setRefreshing(true);setNotice('Refreshing conversation…');}
  try{
   const chats=await listAssistantConversations(listLimit.current);setConversations(chats.items);setMoreChats(chats.hasMore);setLegacy(chats.legacyCount);
   if(key){const result=await listAssistantTasks(key==='legacy'?null:key);if(selectedRef.current===key){setTasks(previous=>{const merged=new Map(previous.map(t=>[t.id,t]));result.items.forEach(t=>merged.set(t.id,t));return [...merged.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));});}}
   if(manual)setNotice('Conversation is up to date.');
  }catch{setNotice('Could not refresh. Your draft is kept. Try Refresh.');}finally{if(manual)setRefreshing(false);}
 },[]);
 async function openChat(key:string){
  if(selectedRef.current)drafts.current[selectedRef.current]={text:prompt,requestId:id.current};
  selectedRef.current=key;setSelected(key);setDrawer(false);setNotice('');setTasks([]);setLoading(true);setMore(false);nearEnd.current=true;setAtBottom(true);
  setPrompt(drafts.current[key]?.text??'');id.current=drafts.current[key]?.requestId??'';
  try{const result=await listAssistantTasks(key==='legacy'?null:key);if(selectedRef.current===key){setTasks(result.items);setMore(result.hasMore);}}catch{if(selectedRef.current===key)setNotice('Could not load this chat. Try Refresh.');}
  finally{if(selectedRef.current===key)setLoading(false);}
 }
 function newChat(){
  if(selectedRef.current)drafts.current[selectedRef.current]={text:prompt,requestId:id.current};
  const key=crypto.randomUUID();selectedRef.current=key;setSelected(key);setTasks([]);setPrompt('');id.current='';setNotice('');setMore(false);setLoading(false);setDrawer(false);nearEnd.current=true;setAtBottom(true);
  input.current?.focus();
 }
 useEffect(()=>{
  let live=true;
  void (async()=>{try{const result=await listAssistantConversations(listLimit.current);if(!live||initialised.current)return;initialised.current=true;setConversations(result.items);setMoreChats(result.hasMore);setLegacy(result.legacyCount);
   const key=result.items[0]?.id??crypto.randomUUID();selectedRef.current=key;setSelected(key);
   if(result.items.length){const page=await listAssistantTasks(key);if(live&&selectedRef.current===key){setTasks(page.items);setMore(page.hasMore);}}
  }catch{if(live)setNotice('Could not load chats. Try Refresh.');}finally{if(live)setReady(true);}})();
  const timer=setInterval(()=>void refresh(),10000);return()=>{live=false;clearInterval(timer);};
 },[refresh]);
 // VisualViewport keeps the composer above the phone keyboard, including standalone PWA mode.
 useEffect(()=>{
  const main=panel.current?.closest<HTMLElement>('.ember');const viewport=window.visualViewport;
  const fit=()=>{main?.style.setProperty('--chat-height',`${viewport?.height??window.innerHeight}px`);main?.style.setProperty('--chat-top',`${viewport?.offsetTop??0}px`);main?.classList.toggle('ember-keyboard-open',!!viewport&&window.innerHeight-viewport.height>150);};
  fit();viewport?.addEventListener('resize',fit);viewport?.addEventListener('scroll',fit);window.addEventListener('resize',fit);
  return()=>{viewport?.removeEventListener('resize',fit);viewport?.removeEventListener('scroll',fit);window.removeEventListener('resize',fit);main?.classList.remove('ember-keyboard-open');};
 },[]);
 useLayoutEffect(()=>{
  const el=scroller.current;if(!el)return;
  if(prepend.current){el.scrollTop=prepend.current.top+el.scrollHeight-prepend.current.height;prepend.current=null;}
  else if(nearEnd.current)el.scrollTop=el.scrollHeight;
 },[tasks,loading]);
 async function older(){
  const first=tasks[0],key=selectedRef.current;if(!first||!key)return;setLoading(true);
  try{const result=await listAssistantTasks(key==='legacy'?null:key,{createdAt:first.created_at,id:first.id});if(selectedRef.current===key){const el=scroller.current;if(el)prepend.current={height:el.scrollHeight,top:el.scrollTop};setTasks(old=>[...result.items.filter(t=>!old.some(o=>o.id===t.id)),...old]);setMore(result.hasMore);}}catch{setNotice('Could not load earlier messages. Please retry.');}finally{if(selectedRef.current===key)setLoading(false);}
 }
 function send(){
  const key=selectedRef.current;if(!key||pending||(active&&!directFromPrompt(prompt))||!prompt.trim())return;
  if(key==='legacy'){setNotice('Start a new chat to send a request. Earlier requests are kept here.');return;}
  if(!id.current)id.current=crypto.randomUUID();const request=id.current,text=prompt;
  start(async()=>{try{const result=await submitAssistantTask(request,text,key);setNotice(result.message);if(result.ok){setPrompt('');id.current='';delete drafts.current[key];nearEnd.current=true;setAtBottom(true);await refresh();}}catch{setNotice('Could not confirm your request. Retry with the same text.');}});
 }
 function quickRun(request:DirectRequest){
  const key=selectedRef.current;if(!key||key==='legacy'||pending)return;
  const identity=JSON.stringify([key,request]);if(quickRetry.current?.key!==identity)quickRetry.current={key:identity,id:crypto.randomUUID()};
  const taskId=quickRetry.current.id;
  start(async()=>{try{const r=await submitAssistantTask(taskId,`${DIRECT_LABELS[request.kind]}${request.query?' · '+request.query:''}${request.from?' · '+request.from+' to '+(request.to||request.from):''}`,key,request);setNotice(r.message);if(r.ok){quickRetry.current=null;nearEnd.current=true;await refresh();}}catch{setNotice('Could not confirm the request. Retry is safe.');}});
 }
 async function rename(){
  if(!selected||selected==='legacy')return;const value=window.prompt('Chat title',title);if(value===null)return;
  start(async()=>{try{const result=await renameAssistantConversation(selected,value);setNotice(result.message);if(result.ok)await refresh();}catch{setNotice('Could not rename this chat.');}});
 }
 return <section ref={panel} className="office-chat" aria-label="Office Manager">
 <div className={`office-chat-sidebar ${drawer?'is-open':''}`}>
  <div className="office-chat-sidebar-top"><strong>Conversations</strong><button className="office-chat-mobile" aria-label="Close conversations" onClick={()=>setDrawer(false)}><X size={20}/></button></div>
  <button className="office-chat-new" disabled={pending||!ready} onClick={newChat}><Plus size={18}/> New chat</button>
  <div className="office-chat-history">{conversations.map(c=><button key={c.id} disabled={pending} aria-current={selected===c.id?'true':undefined} onClick={()=>void openChat(c.id)}><MessageSquare size={16}/><span><strong>{c.title}</strong><small>{c.status==='running'?'Working…':c.status==='queued'?'Queued…':new Date(c.updated_at).toLocaleDateString('en-AU',{day:'numeric',month:'short',timeZone:'Australia/Perth'})}</small></span></button>)}
   {legacy>0&&<button disabled={pending} onClick={()=>void openChat('legacy')} aria-current={selected==='legacy'?'true':undefined}><MessageSquare size={16}/><span>Other requests<small>Invoice checks & earlier app versions</small></span></button>}
   {moreChats&&listLimit.current<500&&<button onClick={()=>{listLimit.current=Math.min(500,listLimit.current+30);void refresh();}}>Load more chats</button>}
   {!conversations.length&&ready&&<p className="muted">Your chats will appear here.</p>}
  </div><p className="ember-footnote">A separate chat for each topic. Company records remain available in every chat.</p>
 </div>
 {drawer&&<button className="office-chat-backdrop" aria-label="Close conversations" onClick={()=>setDrawer(false)}/>}
 <div className="office-chat-main">
  <header className="office-chat-toolbar"><button className="office-chat-mobile" aria-label="Open conversations" onClick={()=>setDrawer(true)}><PanelLeft size={21}/></button><div><h2>Office Manager</h2><p title={title}>{title}</p></div><button aria-label="Rename chat" disabled={pending||!conversations.some(c=>c.id===selected)} onClick={()=>void rename()}><Pencil size={18}/></button><button aria-label="Refresh conversation" aria-busy={refreshing} disabled={refreshing} onClick={()=>void refresh(true)}><RefreshCw size={18}/></button><button aria-label="New chat" disabled={pending||!ready} onClick={newChat}><Plus size={22}/></button></header>
  <div className="office-chat-scroll" ref={scroller} role="region" aria-label="Conversation messages" tabIndex={0} onScroll={e=>{const el=e.currentTarget;nearEnd.current=el.scrollHeight-el.scrollTop-el.clientHeight<90;setAtBottom(nearEnd.current);}}>
   {more&&<button className="office-chat-older" disabled={loading} onClick={()=>void older()}>Load earlier messages</button>}
   {(!ready||loading)&&<p role="status" className="muted">Loading conversation…</p>}
   {ready&&!loading&&!tasks.length&&<div className="office-chat-welcome"><div className="orb large"/><h3>What needs doing?</h3><p>Find an invoice, check a contractor, or prepare your next client invoice.</p><div className="ember-chips">{[['Today’s records','Өнөөдрийн ажлын бүртгэлийг товч харуул.'],['Check invoices','Хамгийн сүүлд ирсэн инвойсуудыг шалга.'],['Contractors','Контракторуудын бүртгэлийг харуул.']].map(([label,text])=><button key={label} onClick={()=>{setPrompt(text);id.current='';input.current?.focus();}}>{label}</button>)}</div></div>}
{tasks.map(task=>{const parsed=assistantResponse.safeParse(task.response),r=parsed.success?parsed.data:null;const direct=directResult(task);return <article className="ember-person office-chat-message" data-status={task.status} key={task.id}><p className="eyebrow">YOU</p><p style={{whiteSpace:'pre-wrap'}}>{task.prompt}</p><p className="eyebrow">OFFICE MANAGER</p>{task.status==='queued'?<p className="muted">{task.executor==='direct'?'Reading office sources…':task.executor==='cloud'?'Queued for cloud assistant…':'Waiting for your Mac…'}</p>:task.status==='running'?<p className="muted">Working on your request…</p>:r?<><p style={{whiteSpace:'pre-wrap'}}>{r.reply}</p>{direct&&<DirectResultView result={direct} pending={pending} run={quickRun}/>} {r.evidence&&!direct&&r.evidence.totalCalls>0&&<p className="ember-footnote">Evidence checks: {[...new Set(r.evidence.toolCalls.filter(c=>c.ok).map(c=>({search_company_records:'Company records searched',read_company_record:'Record details read',read_invoice_source:'Source text read',check_invoice:'Invoice checks run',lookup_supplier_abn:'ABN lookup run',search_work_mail:'Live Gmail searched',read_work_mail:'Email text read',read_work_mail_attachment:'Attachment text read'}[c.tool]??'Company evidence checked')))].join(' · ')||'No successful retrieval'}. See the reply for results and any incomplete checks.</p>}{r.action==='create_contractors'&&<ContractorBatch task={task} response={r} pending={pending} run={action=>start(async()=>{try{const result=await action();setNotice(result.message);await refresh();if(result.ok)router.refresh();}catch{setNotice('Could not confirm the batch. Refresh before retrying.');}})}/>}
{r.action==='save_contractor_names'&&<div className="ember-panel"><h3>Short names for Bobby & client summaries</h3>{r.contractorNames.map(n=><p key={n.workerId}>{n.fullName} → <strong>{n.shortName}</strong>{n.aliases.length>0&&<small>Also: {n.aliases.join(', ')}</small>}</p>)}{task.applied_id?<p>Names saved ✓</p>:<button className="ember-primary" disabled={pending} onClick={()=>start(async()=>{try{const result=await applyContractorNamesTask(task.id);setNotice(result.message);if(result.ok){await refresh();router.refresh();}}catch{setNotice('Could not confirm name changes. Refresh before retrying.');}})}>{pending?'Saving…':'Save all short names'}</button>}</div>}
{r.action==='save_company_record'&&<CompanyRecordProposalView task={task} response={r} pending={pending} run={action=>start(async()=>{try{const result=await action();setNotice(result.message);await refresh();if(result.ok)router.refresh();}catch{setNotice('Could not confirm the save. Refresh before retrying.');}})}/>}
{r.action!=='none'&&r.action!=='create_contractors'&&r.action!=='save_company_record'&&r.action!=='save_contractor_names'&&<div className="ember-panel"><p><strong>{r.action.replaceAll('_',' ')}</strong></p><p>{r.name}</p><p>{r.email} {r.phone}</p>{r.abn&&<p>ABN {r.abn}</p>}{(r.action==='create_site'||r.action==='prepare_client_invoice')&&<p>Client: {clients.find(c=>c.id===r.clientId)?.name??'Client unavailable — review before saving'}</p>}{r.address&&<p>{r.address}</p>}{r.action==='create_client'&&<p>Payment terms: 14 days · Active</p>}{r.action==='create_contractor'&&<p>{r.group==='regular'?'Regular contractor':'Occasional contractor'} · Active</p>}{r.action==='prepare_client_invoice'&&<p>Work period: {r.periodStart} to {r.periodEnd}<br/>Issue: {r.issueDate} · Due: {r.dueDate}<br/>GST: {r.gstMode==='none'?'Not charged':'10% added to agreed rates'}</p>}{task.applied_id?<p>{r.action==='prepare_client_invoice'?'Draft prepared':'Created'} ✓</p>:<button className="ember-primary" aria-busy={pending} disabled={pending} onClick={()=>start(async()=>{setNotice('Saving record…');try{const result=await applyAssistantTask(task.id);setNotice(result.message);if(result.ok){await refresh();router.refresh();}}catch{setNotice('Could not confirm the save. Refresh before retrying.');}})}>{pending?'Saving…':r.action==='prepare_client_invoice'?'Prepare draft':'Create record'}</button>}</div>}{r.section!=='none'&&<button className="ember-link" onClick={()=>navigate(r.section)}>Open related section →</button>}</>:<p className="error">{task.cloud_error??'Assistant could not complete this request. Check its connection and try again.'}</p>}</article>;})}
  </div>
  {!atBottom&&<button className="office-chat-latest" onClick={()=>{const el=scroller.current;if(el)el.scrollTo({top:el.scrollHeight,behavior:'smooth'});nearEnd.current=true;setAtBottom(true);}}><ArrowDown size={16}/> Latest</button>}
  <div className="office-chat-compose">
   {ready&&selected!=='legacy'&&<DirectTools pending={pending} run={quickRun}/>}

   {notice&&<p className="office-chat-status" role="status">{notice}</p>}
   {active&&<p className="office-chat-status" role="status">{tasks.some(t=>t.status==='running')?'Working on this request… You can start a new chat for another task.':tasks.some(t=>(t.executor==='cloud'||t.executor==='direct')&&t.status==='queued')?'Queued on the server. Your Mac can stay off.':'AI work is waiting for your Mac. Office tools below can still read email, find files and compare saved invoices now.'}</p>}
   <form onSubmit={e=>{e.preventDefault();send();}}><label className="sr-only" htmlFor="office-request">Your request</label><textarea ref={input} id="office-request" rows={2} maxLength={4000} placeholder={selected==='legacy'?'Start a new chat to send a request…':'Message your office manager…'} value={prompt} disabled={pending||!ready||selected==='legacy'} onChange={e=>{setPrompt(e.target.value);id.current='';}} onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/><button className="office-chat-send" aria-label="Send request" title="Send request (⌘/Ctrl + Enter)" disabled={pending||(active&&!directFromPrompt(prompt))||!ready||!prompt.trim()||selected==='legacy'} type="submit"><Send size={20}/></button></form>
   <details className="office-chat-info"><summary>Assistant · Connections & about</summary><p><Link href="/office/connections">Cloud connections →</Link></p><p>Office tools and supported direct read commands use the server without an AI API or Mac. Other requests use cloud AI only when activated; otherwise they run on your Mac. Existing requests keep their original route. Local filing and invoice register import still use the Mac. The assistant uses this chat’s six latest completed exchanges for follow-up context and can search company records, saved decisions and work items across chats. Proposals and outgoing invoice emails still require your approval.</p></details>
  </div>
 </div></section>;
}
