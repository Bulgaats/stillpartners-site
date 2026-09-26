create table public.office_invoice_events (
 id uuid primary key,
 document_id text not null,
 kind text not null check(kind in ('approve','payment','void')),
 source_digest text not null,
 document jsonb not null,
 amount_cents bigint,
 payment_date date,
 reason text not null check(length(trim(reason)) between 3 and 2000),
 target_id uuid references public.office_invoice_events(id),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 check((kind='payment' and amount_cents>0 and payment_date is not null and target_id is null) or (kind='approve' and amount_cents is null and payment_date is null and target_id is null) or (kind='void' and amount_cents is null and payment_date is null and target_id is not null))
);
create unique index office_invoice_event_void_once on public.office_invoice_events(target_id) where kind='void';
create index office_invoice_events_document on public.office_invoice_events(document_id,created_at);
alter table public.office_invoice_events enable row level security;
revoke all on public.office_invoice_events from anon,authenticated;
grant select on public.office_invoice_events to authenticated;
grant all on public.office_invoice_events to service_role;
create policy finance_events_read on public.office_invoice_events for select to authenticated using ((select public.is_admin()));
create schema if not exists office_private;
revoke all on schema office_private from public;
grant usage on schema office_private to authenticated;
create function office_private.record_invoice_event(p_id uuid,p_document_id text,p_kind text,p_digest text,p_amount bigint,p_day date,p_reason text,p_target uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare s jsonb; digest text; d jsonb; prior public.office_invoice_events%rowtype; target public.office_invoice_events%rowtype; paid bigint; abn text; total integer; i integer; weights integer[]=array[10,1,3,5,7,9,11,13,15,17,19];
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Finance admin access required'; end if;
 perform pg_advisory_xact_lock(917263);
 select * into prior from public.office_invoice_events where id=p_id;
 if found then
  if prior.document_id=p_document_id and prior.kind=p_kind and prior.source_digest=p_digest and prior.amount_cents is not distinct from p_amount and prior.payment_date is not distinct from p_day and prior.reason=p_reason and prior.target_id is not distinct from p_target and prior.created_by=auth.uid() then return prior.id; end if;
  raise exception 'Request ID already used for different information';
 end if;
 if length(trim(p_reason))<3 or length(p_reason)>2000 then raise exception 'Add a confirmation or correction reason'; end if;
 select payload,source_digest into s,digest from public.office_invoice_snapshots order by exported_at desc limit 1;
 if digest is distinct from p_digest then raise exception 'Invoice register changed. Refresh before continuing'; end if;
 select x into d from jsonb_array_elements(s->'documents') x where x->>'id'=p_document_id;
 if d is null then raise exception 'Invoice not found'; end if;
 if p_kind='void' then
  select * into target from public.office_invoice_events where id=p_target and kind='payment' and document_id=p_document_id;
  if not found then raise exception 'Office payment not found'; end if;
  -- Once a local payment is exported, cancellation must use the Mac audit workflow until reverse sync exists.
  if exists(select 1 from jsonb_array_elements(d->'payments') x where x->>'id'=p_target::text) then raise exception 'Payment already synchronized. Correct it in the Mac assistant'; end if;
  if exists(select 1 from public.office_invoice_events where target_id=p_target) then raise exception 'Payment already cancelled'; end if;
 else
  if p_kind not in ('approve','payment') then raise exception 'Unknown action'; end if;
  if d->>'recordType'<>'invoice' or coalesce(d->>'duplicateOf','')<>'' then raise exception 'Use the original, non-test invoice'; end if;
  if d->>'currency'<>'AUD' or coalesce((d->>'amountCents')::bigint,0)<=0 or length(trim(d->>'name'))<2 then raise exception 'Correct supplier, currency and amount in the Mac assistant first'; end if;
  abn=regexp_replace(d->>'abn','\s','','g');
  if abn !~ '^[0-9]{11}$' or abn='62687072420' then raise exception 'Valid supplier ABN required'; end if;
  total=-10;
  for i in 1..11 loop total=total+substr(abn,i,1)::integer*weights[i]; end loop;
  if total%89<>0 then raise exception 'Supplier ABN checksum invalid'; end if;
  if p_kind='payment' then
   if not coalesce((d->>'approved')::boolean,false) and not exists(select 1 from public.office_invoice_events e where e.document_id=p_document_id and e.kind='approve' and e.source_digest=p_digest) then raise exception 'Approve invoice details first'; end if;
   if p_amount is null or p_amount<=0 or p_day is null or p_day>(now() at time zone 'Australia/Perth')::date then raise exception 'Enter actual payment amount and a valid payment date'; end if;
   select coalesce((d->>'paidCents')::bigint,0)+coalesce(sum(e.amount_cents),0) into paid from public.office_invoice_events e where e.document_id=p_document_id and e.kind='payment' and not exists(select 1 from public.office_invoice_events v where v.target_id=e.id) and not exists(select 1 from jsonb_array_elements(d->'payments') x where x->>'id'=e.id::text);
   if paid+p_amount>(d->>'amountCents')::bigint then raise exception 'Payment exceeds the recorded remaining balance'; end if;
  end if;
 end if;
 insert into public.office_invoice_events(id,document_id,kind,source_digest,document,amount_cents,payment_date,reason,target_id,created_by) values(p_id,p_document_id,p_kind,p_digest,d,p_amount,p_day,p_reason,p_target,auth.uid());
 return p_id;
end;
$$;
revoke all on function office_private.record_invoice_event(uuid,text,text,text,bigint,date,text,uuid) from public,anon;
grant execute on function office_private.record_invoice_event(uuid,text,text,text,bigint,date,text,uuid) to authenticated;
create function public.office_record_invoice_event(p_id uuid,p_document_id text,p_kind text,p_digest text,p_amount bigint,p_day date,p_reason text,p_target uuid) returns uuid
language sql security invoker set search_path='' as $$select office_private.record_invoice_event(p_id,p_document_id,p_kind,p_digest,p_amount,p_day,p_reason,p_target);$$;
revoke all on function public.office_record_invoice_event(uuid,text,text,text,bigint,date,text,uuid) from public,anon;
grant execute on function public.office_record_invoice_event(uuid,text,text,text,bigint,date,text,uuid) to authenticated;
