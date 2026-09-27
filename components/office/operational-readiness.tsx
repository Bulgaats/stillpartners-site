'use client';
import {useEffect,useState} from 'react';
import {macSyncFreshness,type MacSync} from '@/lib/office/mac-sync';
import {operationalReadiness} from '@/lib/office/readiness';
import type {OfficeData} from '@/lib/office/foundation';
import type {InvoiceSnapshot} from '@/lib/office/invoice-snapshot';
export function OperationalReadiness({data,snapshot,day,navigate,sync}:{sync:MacSync;data:OfficeData;snapshot:InvoiceSnapshot|null;day:string;navigate:(s:string)=>void}){
 const r=operationalReadiness(data,snapshot,day);
 const [now,setNow]=useState<number|null>(null);
 useEffect(()=>{setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer);},[]);
 const freshness=now===null?null:macSyncFreshness(sync,now);
 return <section className="ember-panel"><h2>Ready for new work</h2><p>Historical accounts are kept separately. New work uses agreed rates and the hours you record.</p><div className="ember-chips"><button onClick={()=>navigate('rates')}>Agreed rates · {r.missingRates.length?`${r.missingRates.length} to enter`:'Base rates ready'}</button><button onClick={()=>navigate('daily')}>Record site work</button><button onClick={()=>navigate('contractor-invoices')}>Active invoices · {r.unknownPeriods.length} missing periods</button></div>{r.missingRates.length>0&&<p className="ember-footnote">Enter each agreed contractor rate before automatic invoice matching. Work hours can be saved now. Old spreadsheet rates are not reused.</p>}{r.workMissingRates.length>0&&<p className="ember-notice">{r.workMissingRates.length} new work records need a contractor or client rate before billing.</p>}{sync.devices.some(d=>!d.revoked&&(d.health?.status==='error'||d.health?.blocked||d.health?.archive_errors||d.health?.backup_error))&&<p className="ember-notice">Mac filing or backup needs attention. Payment records remain saved online. Open Money → Mac connection for details.</p>}{freshness?.stale&&<p className="ember-notice">{freshness.linked?'Mac sync has no recent successful update.':'No active Mac connection is registered.'} Online records remain available; local filing may be waiting. <button className="ember-text-button" onClick={()=>navigate('contractor-invoices')}>Check Mac connection →</button></p>}</section>;
}
