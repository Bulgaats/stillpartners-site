-- Hosted deterministic reads share Bobby's durable conversations. They cannot
-- produce apply-able proposals, payments or outgoing mail.
alter table public.office_assistant_tasks drop constraint office_assistant_tasks_executor_check;
alter table public.office_assistant_tasks add constraint office_assistant_tasks_executor_check check(executor in ('mac','cloud','direct'));
create function office_private.direct_exchange(p_owner uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare task public.office_assistant_tasks%rowtype;lease uuid;
begin
 if auth.uid() is not null and auth.uid()<>p_owner then raise exception 'Owner mismatch';end if;
 if not exists(select 1 from public.profiles where id=p_owner and role::text='admin' and coalesce(is_active,true)) then raise exception 'Active finance admin required';end if;
 if p_request->>'action'='claim' then
  select * into task from public.office_assistant_tasks where id=(p_request->>'id')::uuid and user_id=p_owner and executor='direct' and kind='chat' and (status='queued' or (status='running' and started_at<now()-interval '90 seconds')) for update skip locked;
  if not found then return '{}'::jsonb;end if;
  lease=gen_random_uuid();update public.office_assistant_tasks set status='running',lease_id=lease,started_at=now() where id=task.id;
  return jsonb_build_object('id',task.id,'context',task.context,'lease_id',lease);
 elsif p_request->>'action'='complete' then
  if p_request->>'status' not in ('done','error') or p_request->'response'->>'action' is distinct from 'none' or jsonb_typeof(p_request->'response') is distinct from 'object' or pg_column_size(p_request->'response')>180000 then raise exception 'Invalid read-only result';end if;
  update public.office_assistant_tasks set status=p_request->>'status',response=p_request->'response',finished_at=now() where id=(p_request->>'id')::uuid and user_id=p_owner and executor='direct' and status='running' and lease_id=(p_request->>'lease_id')::uuid;
  return jsonb_build_object('ok',found);
 end if;
 raise exception 'Unsupported direct action';
end;$$;
revoke all on function office_private.direct_exchange(uuid,jsonb) from public,anon,authenticated;
grant execute on function office_private.direct_exchange(uuid,jsonb) to service_role;
create function public.office_direct_exchange(p_owner uuid,p_request jsonb) returns jsonb language sql security invoker set search_path='' as $$select office_private.direct_exchange(p_owner,p_request);$$;
revoke all on function public.office_direct_exchange(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.office_direct_exchange(uuid,jsonb) to service_role;

-- Originals are never replaced. Each attachment gets an immutable, hashed path.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('office-documents','office-documents',false,3145728,array['application/pdf','image/png','image/jpeg','image/webp','text/plain']) on conflict(id) do nothing;
create table public.office_document_files(
 id uuid primary key,document_id uuid not null references public.office_documents(id),
 filename text not null check(length(filename) between 1 and 180),mime text not null check(mime in ('application/pdf','image/png','image/jpeg','image/webp','text/plain')),
 bytes integer not null check(bytes between 1 and 3145728),sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 object_path text not null unique, status text not null check(status in ('pending','ready')),
 uploaded_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(document_id,sha256)
);
create index office_document_files_actor on public.office_document_files(uploaded_by);
alter table public.office_document_files enable row level security;
revoke all on public.office_document_files from public,anon,authenticated;
grant select on public.office_document_files to authenticated;
grant all on public.office_document_files to service_role;
create policy office_files_read on public.office_document_files for select to authenticated using((select public.is_admin()) and status='ready');
create policy office_file_object_read on storage.objects for select to authenticated using(bucket_id='office-documents' and (select public.is_admin()) and exists(select 1 from public.office_document_files f where f.object_path=name and f.status='ready'));
create function office_private.document_file_exchange(p_owner uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f public.office_document_files%rowtype;v_id uuid=(p_request->>'id')::uuid;doc uuid=(p_request->>'documentId')::uuid;
begin
 if auth.uid() is not null and auth.uid()<>p_owner then raise exception 'Owner mismatch';end if;
 if not exists(select 1 from public.profiles where id=p_owner and role::text='admin' and coalesce(is_active,true)) then raise exception 'Active finance admin required';end if;
 if p_request->>'action'='reserve' then
  perform pg_advisory_xact_lock(929261);
  if not exists(select 1 from public.office_documents where id=doc and status='active') then raise exception 'Save an active document reference first';end if;
  select * into f from public.office_document_files where id=v_id or (document_id=doc and sha256=p_request->>'sha256') order by (id=v_id) desc limit 1;
  if found then
   if f.document_id<>doc or f.sha256<>p_request->>'sha256' or f.bytes<>(p_request->>'bytes')::integer or f.mime<>p_request->>'mime' then raise exception 'Upload identity already used for different content';end if;
   return to_jsonb(f);
  end if;
  -- A conservative workspace guard, not a promise about provider billing/quota.
  if (select coalesce(sum(bytes),0) from public.office_document_files)+(p_request->>'bytes')::integer>104857600 then raise exception 'Document store reached 100 MB. Keep larger files in Gmail or review storage before adding more.';end if;
  insert into public.office_document_files(id,document_id,filename,mime,bytes,sha256,object_path,status,uploaded_by)
  values(v_id,doc,p_request->>'filename',p_request->>'mime',(p_request->>'bytes')::integer,p_request->>'sha256',doc::text||'/'||v_id::text,'pending',p_owner) returning * into f;
  return to_jsonb(f);
 elsif p_request->>'action'='complete' then
  update public.office_document_files set status='ready' where id=v_id and sha256=p_request->>'sha256' returning * into f;
  if not found then raise exception 'Upload reservation missing';end if;return to_jsonb(f);
 end if;
 raise exception 'Unsupported file action';
end;$$;
revoke all on function office_private.document_file_exchange(uuid,jsonb) from public,anon,authenticated;
grant execute on function office_private.document_file_exchange(uuid,jsonb) to service_role;
create function public.office_document_file_exchange(p_owner uuid,p_request jsonb) returns jsonb language sql security invoker set search_path='' as $$select office_private.document_file_exchange(p_owner,p_request);$$;
revoke all on function public.office_document_file_exchange(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.office_document_file_exchange(uuid,jsonb) to service_role;

-- The existing revocable Mac device may read a single registered file. This
-- grants no storage enumeration, arbitrary paths, writes or sending authority.
create function office_private.device_document_file(p_token text,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid;f public.office_document_files%rowtype;
begin
 if p_token is null or length(p_token)<40 or length(p_token)>128 then raise exception 'Device authentication required';end if;
 select owner_id into owner from office_private.mac_devices where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and not revoked;
 if owner is null or not exists(select 1 from public.profiles where id=owner and role::text='admin' and coalesce(is_active,true)) then raise exception 'Device authentication required';end if;
 if auth.uid() is not null and auth.uid()<>owner then raise exception 'Owner mismatch';end if;
 select * into f from public.office_document_files where id=p_id and status='ready';
 if not found then raise exception 'Registered file unavailable';end if;
 return to_jsonb(f);
end;$$;
revoke all on function office_private.device_document_file(text,uuid) from public,anon,authenticated;
grant execute on function office_private.device_document_file(text,uuid) to service_role;
create function public.office_device_document_file(p_token text,p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select office_private.device_document_file(p_token,p_id);$$;
revoke all on function public.office_device_document_file(text,uuid) from public,anon,authenticated;
grant execute on function public.office_device_document_file(text,uuid) to service_role;

-- Include file manifests in the existing authorised device backup, not the bytes.
do $$declare definition text;begin
 select pg_get_functiondef('office_private.mac_exchange(text,jsonb)'::regprocedure) into definition;
 if position('''office_document_files''' in definition)=0 then
  if position('''office_documents''' in definition)=0 then raise exception 'Document backup marker missing';end if;
  execute replace(definition,'''office_documents''','''office_documents'',''office_document_files''');
 end if;
end;$$;
