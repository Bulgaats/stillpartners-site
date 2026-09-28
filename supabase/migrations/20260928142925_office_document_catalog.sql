-- Source references only. Original files, mail, invoices and payment records are unchanged.
create table public.office_documents (
 id uuid primary key, version integer not null default 1 check(version>0),
 title text not null check(length(trim(title)) between 2 and 160),
 entity_type text not null check(entity_type in ('company','contractor','client')),entity_id uuid,
 category text not null check(category in ('insurance','licence','white_card','cv','agreement','other')),
 source_url text not null default '' check(length(source_url)<=1000 and (source_url='' or source_url ~ '^https://[^/@[:space:]]+([/?#]|$)')),
 source_note text not null default '' check(length(source_note)<=1000),notes text not null default '' check(length(notes)<=4000),
 expires_on date,expiry_confirmed boolean not null default false,status text not null check(status in ('active','archived')),
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((entity_type='company')=(entity_id is null)),check(source_url<>'' or length(trim(source_note))>0),check(not expiry_confirmed or expires_on is not null)
);
create table public.office_document_events (
 id uuid primary key,document_id uuid not null references public.office_documents(id),actor uuid not null references auth.users(id),
 request jsonb not null,before_data jsonb,after_data jsonb not null,created_at timestamptz not null default now()
);
create index office_document_events_document on public.office_document_events(document_id,created_at desc);
create index office_documents_expiry on public.office_documents(expires_on) where status='active' and expiry_confirmed;
create index office_documents_created_by on public.office_documents(created_by);
create index office_documents_updated_by on public.office_documents(updated_by);
create index office_document_events_actor on public.office_document_events(actor);
alter table public.office_documents enable row level security;
alter table public.office_document_events enable row level security;
revoke all on public.office_documents,public.office_document_events from anon,authenticated;
grant select on public.office_documents,public.office_document_events to authenticated;
create policy documents_finance_read on public.office_documents for select to authenticated using ((select public.is_admin()));
create policy document_events_finance_read on public.office_document_events for select to authenticated using ((select public.is_admin()));

create function office_private.save_document(p_event uuid,p_document jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor_id uuid=auth.uid();doc_id uuid=(p_document->>'id')::uuid;before_row public.office_documents%rowtype;after_row public.office_documents%rowtype;replay public.office_document_events%rowtype;
begin
 if actor_id is null or not exists(select 1 from public.profiles where id=actor_id and role::text='admin' and coalesce(is_active,true)) then raise exception 'Active finance admin required';end if;
 if p_event is null or doc_id is null or p_document->>'expectedVersion' is null then raise exception 'Document identity and version required';end if;
 perform pg_advisory_xact_lock(hashtextextended(doc_id::text,918028));
 select * into replay from public.office_document_events where id=p_event;
 if found then
  if replay.actor<>actor_id or replay.request<>p_document then raise exception 'Request identity was already used for different details';end if;
  return replay.document_id;
 end if;
 select * into before_row from public.office_documents where id=doc_id for update;
 if coalesce(before_row.version,0)<>(p_document->>'expectedVersion')::integer then raise exception 'Document changed. Reload it before saving';end if;
 if p_document->>'entityType'='contractor' and not exists(select 1 from public.workers where id=(p_document->>'entityId')::uuid) then raise exception 'Contractor not found';end if;
 if p_document->>'entityType'='client' and not exists(select 1 from public.clients where id=(p_document->>'entityId')::uuid) then raise exception 'Client not found';end if;
 insert into public.office_documents(id,version,title,entity_type,entity_id,category,source_url,source_note,notes,expires_on,expiry_confirmed,status,created_by,updated_by)
 values(doc_id,1,trim(p_document->>'title'),p_document->>'entityType',nullif(p_document->>'entityId','')::uuid,p_document->>'category',p_document->>'sourceUrl',p_document->>'sourceNote',p_document->>'notes',nullif(p_document->>'expiresOn','')::date,(p_document->>'expiryConfirmed')::boolean,p_document->>'status',actor_id,actor_id)
 on conflict(id) do update set version=office_documents.version+1,title=excluded.title,entity_type=excluded.entity_type,entity_id=excluded.entity_id,category=excluded.category,source_url=excluded.source_url,source_note=excluded.source_note,notes=excluded.notes,expires_on=excluded.expires_on,expiry_confirmed=excluded.expiry_confirmed,status=excluded.status,updated_by=actor_id,updated_at=now()
 returning * into after_row;
 insert into public.office_document_events(id,document_id,actor,request,before_data,after_data) values(p_event,doc_id,actor_id,p_document,case when before_row.id is null then null else to_jsonb(before_row) end,to_jsonb(after_row));
 return doc_id;
end;$$;
revoke all on function office_private.save_document(uuid,jsonb) from public,anon,authenticated;
grant execute on function office_private.save_document(uuid,jsonb) to authenticated;
create function public.office_save_document(p_event uuid,p_document jsonb) returns uuid language sql security invoker set search_path='' as $$select office_private.save_document(p_event,p_document);$$;
revoke all on function public.office_save_document(uuid,jsonb) from public,anon;
grant execute on function public.office_save_document(uuid,jsonb) to authenticated;

create function office_private.scan_document_expiry(p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
declare d record;x record;seen text[]='{}';key text;today date=(now() at time zone 'Australia/Perth')::date;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role::text='admin' and coalesce(is_active,true)) then raise exception 'Active finance admin required';end if;
 if not (select enabled from office_private.monitor_state where singleton) then return;end if;
 if not pg_try_advisory_xact_lock(918029) then return;end if;
 for d in select * from public.office_documents where status='active' and expiry_confirmed and expires_on<=today+30 loop
  key='document-expiry:'||d.id;seen=array_append(seen,key);
  perform office_private.detect_work(p_actor,key,'document_expiry','Document renewal: '||d.title,
   'Confirmed expiry: '||d.expires_on||'. Original source: '||coalesce(nullif(d.source_url,''),d.source_note),
   'Open Company → Documents, check the original and prepare its renewal or replacement. No message has been sent.',
   'Document '||d.id,jsonb_build_object('documentId',d.id,'version',d.version,'expiresOn',d.expires_on,'sourceUrl',d.source_url,'stage',case when d.expires_on<today then 'expired' when d.expires_on<=today+7 then 'within_7_days' when d.expires_on<=today+14 then 'within_14_days' else 'within_30_days' end));
 end loop;
 for x in select l.issue_key,r.title from office_private.detected_work l join public.office_company_records r on r.id=l.record_id where l.active and l.rule='document_expiry' and not(l.issue_key=any(seen)) loop
  perform office_private.detect_work(p_actor,x.issue_key,'document_expiry',x.title,'The document no longer has a confirmed expiry within the reminder window.','','',jsonb_build_object('cleared',true),false);
 end loop;
end;$$;
revoke all on function office_private.scan_document_expiry(uuid) from public,anon,authenticated;
create or replace function office_private.monitor_control(p_enabled boolean default null,p_scan boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Finance admin required';end if;
 if p_enabled is not null then update office_private.monitor_state set enabled=p_enabled where singleton;end if;
 if p_scan then perform office_private.scan_work(auth.uid());perform office_private.scan_document_expiry(auth.uid());end if;
 return (select to_jsonb(s)-'singleton' from office_private.monitor_state s where singleton);
end;$$;
create or replace function office_private.monitor_after_health() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 select owner_id into actor from office_private.mac_devices where id=new.device_id and not revoked;
 if actor is not null then
  begin perform office_private.scan_work(actor);perform office_private.scan_document_expiry(actor);
  exception when others then update office_private.monitor_state set last_error=sqlstate where singleton;end;
 end if;
 return new;
end;$$;
