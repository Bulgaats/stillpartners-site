'use client';
import {useEffect,useRef,useState} from 'react';
import type {Contractor} from '@/lib/office/foundation';
export function PeoplePicker({siteName,people,selected,locked,toggle,close}:{siteName:string;people:Contractor[];selected:string[];locked:string[];toggle:(id:string)=>void;close:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[search,setSearch]=useState('');
 useEffect(()=>{const el=dialog.current;el?.showModal();const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{el?.close();document.body.style.overflow=previous;};},[]);
 const query=search.trim().toLocaleLowerCase();
 const visible=people.filter(p=>[p.fullName,p.shortName,...p.aliases??[]].join(' ').toLocaleLowerCase().includes(query));
 return <dialog ref={dialog} className="daily-people-dialog" aria-labelledby="daily-picker-title" onCancel={e=>{e.preventDefault();close();}}>
  <header><h2 id="daily-picker-title">{siteName}</h2><strong aria-live="polite">{selected.length} people selected</strong><input autoFocus type="search" aria-label="Find contractors" placeholder="Name or short name…" value={search} onChange={e=>setSearch(e.target.value)}/></header>
  <div className="daily-people-options">{visible.map(p=><label key={p.id}><input type="checkbox" checked={selected.includes(p.id)} disabled={locked.includes(p.id)} onChange={()=>toggle(p.id)}/><span><strong>{p.shortName||p.fullName}</strong>{p.shortName&&<small>{p.fullName}</small>}{locked.includes(p.id)&&<small>Hours already saved</small>}</span></label>)}{!visible.length&&<p>No available people match.</p>}</div>
  <footer><button className="ember-primary" onClick={close}>Done · {selected.length} selected</button></footer>
 </dialog>;
}
