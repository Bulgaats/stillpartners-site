-- Device credentials are generated on the Mac; only a SHA-256 hash is stored here.
create table office_private.mac_devices (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 owner_id uuid not null references auth.users(id),
 revoked boolean not null default false,
 created_at timestamptz not null default now(),
 last_seen timestamptz
);
alter table office_private.mac_devices enable row level security;
revoke all on office_private.mac_devices from public,anon,authenticated;
create table public.office_mac_receipts (
 event_id uuid primary key references public.office_invoice_events(id),
 device_id uuid not null references office_private.mac_devices(id),
 status text not null check(status in ('applied','blocked')),
 file_state text not null check(file_state in ('paid_verified','partial','reversed','reviewed','blocked')),
 message text not null default '',
 updated_at timestamptz not null default now()
);
alter table public.office_mac_receipts enable row level security;
revoke all on public.office_mac_receipts from anon,authenticated;
grant select on public.office_mac_receipts to authenticated;
grant all on public.office_mac_receipts to service_role;
create policy finance_mac_receipts on public.office_mac_receipts for select to authenticated using ((select public.is_admin()));
create function office_private.mac_exchange(p_token text,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare device office_private.mac_devices%rowtype; result jsonb; s jsonb; r jsonb; mode text;
begin
 -- Scheduled device requests do not carry a browser session. Authenticate their separate,
 -- revocable capability and require its owner to remain an active finance admin.
 if p_token is null or length(p_token)<40 or length(p_token)>128 then raise exception 'Device authentication required'; end if;
 select * into device from office_private.mac_devices d where d.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and not d.revoked;
 if not found or not exists(select 1 from public.profiles p where p.id=device.owner_id and p.role::text='admin' and coalesce(p.is_active,true)) then raise exception 'Device authentication required'; end if;
 if auth.uid() is not null and auth.uid()<>device.owner_id then raise exception 'Device owner mismatch'; end if;
 update office_private.mac_devices set last_seen=now() where id=device.id;
 mode=p_request->>'action';
 if mode='pull' then
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at,q.id),'[]'::jsonb) into result from (
   select e.* from public.office_invoice_events e left join public.office_mac_receipts r on r.event_id=e.id
   where r.status is distinct from 'applied' order by r.updated_at nulls first,e.created_at,e.id limit 100
  ) q;
  return jsonb_build_object('events',result);
 elsif mode='commit' then
  perform pg_advisory_xact_lock(917263);
  s=p_request->'snapshot';
  if coalesce(s->>'account','')<>'work@stillpartners.net' or coalesce(s->>'version','')<>'1' or jsonb_typeof(s->'documents') is distinct from 'array' or coalesce(s->>'sourceDigest','') !~ '^[a-f0-9]{64}$' or pg_column_size(s)>10000000 then raise exception 'Invalid snapshot'; end if;
  if jsonb_array_length(s->'documents')>10000 then raise exception 'Snapshot too large'; end if;
  insert into public.office_invoice_snapshots(source_digest,exported_at,imported_by,payload) values(s->>'sourceDigest',now(),device.owner_id,s) on conflict(source_digest) do nothing;
  for r in select * from jsonb_array_elements(coalesce(p_request->'receipts','[]'::jsonb)) loop
   if coalesce(r->>'status','') not in ('applied','blocked') or coalesce(r->>'file_state','') not in ('paid_verified','partial','reversed','reviewed','blocked') then raise exception 'Invalid receipt'; end if;
   insert into public.office_mac_receipts(event_id,device_id,status,file_state,message) values((r->>'event_id')::uuid,device.id,r->>'status',r->>'file_state',left(coalesce(r->>'message',''),300)) on conflict(event_id) do update set status=excluded.status,file_state=excluded.file_state,message=excluded.message,updated_at=now() where office_mac_receipts.status<>'applied';
  end loop;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Unsupported device action';
end;
$$;
revoke all on function office_private.mac_exchange(text,jsonb) from public;
grant usage on schema office_private to anon;
grant execute on function office_private.mac_exchange(text,jsonb) to anon,authenticated;
create function public.office_mac_exchange(p_token text,p_request jsonb) returns jsonb language sql security invoker set search_path='' as $$select office_private.mac_exchange(p_token,p_request);$$;
revoke all on function public.office_mac_exchange(text,jsonb) from public;
grant execute on function public.office_mac_exchange(text,jsonb) to anon,authenticated;
-- Finance admins can see connection health and revoke the Mac without seeing credential hashes.
create function office_private.mac_status() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Finance admin access required'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'last_seen',last_seen,'revoked',revoked)),'[]'::jsonb) from office_private.mac_devices);
end;$$;
revoke all on function office_private.mac_status() from public,anon;
grant execute on function office_private.mac_status() to authenticated;
create function public.office_mac_status() returns jsonb language sql security invoker set search_path='' as $$select office_private.mac_status();$$;
revoke all on function public.office_mac_status() from public,anon;
grant execute on function public.office_mac_status() to authenticated;
create function office_private.revoke_mac(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Finance admin access required'; end if;
 update office_private.mac_devices set revoked=true where id=p_id;
end;$$;
revoke all on function office_private.revoke_mac(uuid) from public,anon;
grant execute on function office_private.revoke_mac(uuid) to authenticated;
create function public.office_revoke_mac(p_id uuid) returns void language sql security invoker set search_path='' as $$select office_private.revoke_mac(p_id);$$;
revoke all on function public.office_revoke_mac(uuid) from public,anon;
grant execute on function public.office_revoke_mac(uuid) to authenticated;
