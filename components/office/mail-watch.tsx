'use client';
import {useEffect,useState} from 'react';
import {mailAttentionSummary} from '@/app/actions/company-records';
import type {MailWatchStatus} from '@/lib/office/company-records';
export function MailWatchHealth({mail,enabled}:{mail:MailWatchStatus;enabled:boolean}){
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(t);},[]);
 const stale=!mail.heartbeat_at||now-Date.parse(mail.heartbeat_at)>600000;
 const status=!enabled?'New-mail checks paused':stale?'New-mail checks waiting for Mac':mail.status==='error'?'New-mail review needs attention':mail.pending?`${mail.pending} emails waiting for Bobby`:'New-mail checks active';
 return <div className="ember-notice" role="status"><strong>{status}</strong><p>{mail.last_scan_at?`Last live Gmail discovery: ${new Date(mail.last_scan_at).toLocaleString('en-AU',{timeZone:'Australia/Perth'})}`:'The first live Gmail check has not been confirmed.'}</p><p className="ember-footnote">{mail.status==='error'?'The last review did not finish. Its email stays queued for retry. ':''}Bobby reads new incoming and self-addressed mail while the Mac is awake. Unfinished work resumes after reconnecting. Notices appear inside this app; phone push notifications are not enabled. Check now above refreshes saved work checks, not Gmail.</p></div>;
}
export function MailAttention({open}:{open:()=>void}){
 const [summary,setSummary]=useState<Awaited<ReturnType<typeof mailAttentionSummary>>|null>(null);
 useEffect(()=>{
  let alive=true,running=false;
  const refresh=async()=>{if(running||document.hidden)return;running=true;try{const next=await mailAttentionSummary();if(alive)setSummary(next);}catch{/* Retain the last acknowledged notice. */}finally{running=false;}};
  void refresh();const timer=setInterval(()=>void refresh(),60000);
  document.addEventListener('visibilitychange',refresh);
  window.addEventListener('focus',refresh);
  return()=>{alive=false;clearInterval(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh);};
 },[]);
 if(!summary?.count)return null;
 return <aside className="ember-notice office-mail-attention" role="status"><strong>Bobby · {summary.count} {summary.count===1?'email needs':'emails need'} your attention</strong><p>{summary.items[0]?.title}</p><button className="ember-text-button" onClick={open}>View prepared work →</button></aside>;
}
