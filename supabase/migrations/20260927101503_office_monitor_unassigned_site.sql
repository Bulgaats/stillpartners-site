-- Keep checks functional when a legacy site has no linked client.
create or replace function office_private.scan_work(p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg office_private.monitor_state%rowtype;s jsonb;d jsonb;x record;seen text[]='{}';rules text[]='{}';issues text[];key text;paid bigint;outcome text;result jsonb='{"created":0,"updated":0,"cleared":0}'::jsonb;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role::text='admin' and coalesce(is_active,true)) then raise exception 'Active finance admin required';end if;
 if not pg_try_advisory_xact_lock(917267) then return jsonb_build_object('busy',true);end if;
 select * into cfg from office_private.monitor_state where singleton for update;
 if not cfg.enabled then return jsonb_build_object('enabled',false);end if;
 select payload into s from public.office_invoice_snapshots order by exported_at desc limit 1;
 if s is not null then
  rules=array_append(rules,'invoice_source');
  for d in select value from jsonb_array_elements(s->'documents') loop
   if d->>'recordType'<>'invoice' or (d#>>'{historicalClosure,source_hash}'=d->>'sourceHash') then continue;end if;
   select coalesce((d->>'paidCents')::bigint,0)+coalesce(sum(e.amount_cents),0) into paid from public.office_invoice_events e
    where e.document_id=d->>'id' and e.kind='payment' and not exists(select 1 from public.office_invoice_events v where v.target_id=e.id)
    and not exists(select 1 from jsonb_array_elements(d->'payments') p where p->>'id'=e.id::text);
   if paid>0 and paid>=coalesce((d->>'amountCents')::bigint,9223372036854775807) then continue;end if;
   select coalesce(array_agg(distinct value order by value),'{}') into issues from jsonb_array_elements_text(coalesce(d->'flags','[]'::jsonb));
   if coalesce(d->>'workPeriod','')='' then issues=array_append(issues,'Work period is missing.');end if;
   if coalesce(d->>'supplierId','')='' then issues=array_append(issues,'Supplier identity is not linked.');end if;
   if coalesce(d->>'duplicateOf','')<>'' then issues=array_append(issues,'Duplicate source: use its original invoice.');end if;
   if cardinality(issues)=0 then continue;end if;
   key='invoice:'||(d->>'id');seen=array_append(seen,key);
   outcome=office_private.detect_work(p_actor,key,'invoice_source','Review invoice: '||coalesce(nullif(d->>'name',''),'Unknown supplier'),
    'Invoice '||coalesce(d->>'invoiceNumber','')||E'\nWork period: '||coalesce(d->>'workPeriod','Unknown')||E'\n'||array_to_string(issues,E'\n'),
    'Open the source invoice and resolve these imported warnings. This is not a new payment request or a completed time/rate comparison.',
    'Invoice '||(d->>'id'),jsonb_build_object('documentId',d->>'id','sourceHash',d->>'sourceHash','invoiceNumber',d->>'invoiceNumber','workPeriod',d->>'workPeriod','issues',issues));
   if outcome<>'unchanged' then result=jsonb_set(result,array[outcome],to_jsonb((result->>outcome)::int+1));end if;
  end loop;
 end if;
 rules=array_append(rules,'work_rates');
 for x in
  select w.id worker_id,w.full_name,j.client_id,k.kind,array_agg(distinct e.work_date order by e.work_date) days
  from public.work_entries e join public.workers w on w.id=e.worker_id join public.jobs j on j.id=e.job_id
  left join public.office_work_adjustments a on a.work_entry_id=e.id cross join (values('contractor'),('client')) k(kind)
  where e.work_date>=cfg.work_from and (case when k.kind='contractor' then coalesce(a.contractor_hours,e.hours) else coalesce(a.client_hours,e.hours) end)>0
   and not exists(select 1 from public.office_rates r where r.worker_id=e.worker_id and r.kind=k.kind and r.voided_at is null and r.effective_from<=e.work_date and (r.client_id=j.client_id or (k.kind='contractor' and r.client_id is null)))
  group by w.id,w.full_name,j.client_id,k.kind
 loop
  key='rates:'||x.worker_id||':'||coalesce(x.client_id::text,'unassigned')||':'||x.kind;seen=array_append(seen,key);
  outcome=office_private.detect_work(p_actor,key,'work_rates','Agreed '||x.kind||' rate needed: '||x.full_name,
   'Recorded work has no applicable agreed '||x.kind||' rate on: '||array_to_string(x.days,', '),
   'Enter the agreed rate and its effective date in Money → Agreed rates. Old spreadsheet rates must not be used.',
   'Contractor '||x.worker_id||'; client '||coalesce(x.client_id::text,'Unassigned: link this site to its client'),jsonb_build_object('workerId',x.worker_id,'clientId',x.client_id,'kind',x.kind,'dates',x.days));
  if outcome<>'unchanged' then result=jsonb_set(result,array[outcome],to_jsonb((result->>outcome)::int+1));end if;
 end loop;
 rules=array_append(rules,'filing');
 for x in select r.event_id,r.message,e.document_id from public.office_mac_receipts r join public.office_invoice_events e on e.id=r.event_id where r.status='blocked' loop
  key='filing:'||x.event_id;seen=array_append(seen,key);
  outcome=office_private.detect_work(p_actor,key,'filing','Mac filing needs attention',x.message,
   'Review the source and Mac receipt. Do not repeat a payment to fix a filing error.','Invoice '||x.document_id,jsonb_build_object('eventId',x.event_id,'documentId',x.document_id,'message',x.message));
  if outcome<>'unchanged' then result=jsonb_set(result,array[outcome],to_jsonb((result->>outcome)::int+1));end if;
 end loop;
 -- Mail remains exact-message-approved. An unknown delivery must never be resent automatically.
 rules=array_append(rules,'mail_delivery');
 for x in select id,invoice_id,status from public.office_invoice_mail where created_by=p_actor and status in ('unknown','blocked','failed') loop
  key='mail:'||x.id;seen=array_append(seen,key);
  outcome=office_private.detect_work(p_actor,key,'mail_delivery','Invoice email delivery: '||x.status,
   'The approved email delivery needs review. Status: '||x.status,
   'Open the client invoice email history. For unknown delivery, check Gmail Sent before preparing any replacement.',
   'Client invoice '||x.invoice_id,jsonb_build_object('mailId',x.id,'invoiceId',x.invoice_id,'status',x.status));
  if outcome<>'unchanged' then result=jsonb_set(result,array[outcome],to_jsonb((result->>outcome)::int+1));end if;
 end loop;
 for x in select l.*,r.title from office_private.detected_work l join public.office_company_records r on r.id=l.record_id
  where l.active and l.rule=any(rules) and not(l.issue_key=any(seen)) and (l.rule<>'mail_delivery' or r.created_by=p_actor)
 loop
  outcome=office_private.detect_work(p_actor,x.issue_key,x.rule,x.title,'The previously detected condition is no longer present in the latest complete check.','','',jsonb_build_object('cleared',true),false);
  if outcome<>'unchanged' then result=jsonb_set(result,array[outcome],to_jsonb((result->>outcome)::int+1));end if;
 end loop;
 result=result||jsonb_build_object('enabled',true,'activeConditions',cardinality(seen),'scope',rules,'snapshotAvailable',s is not null);
 update office_private.monitor_state set last_checked_at=now(),last_error=null,last_result=result where singleton;
 return result;
end;$$;
revoke all on function office_private.scan_work(uuid) from public,anon,authenticated;
