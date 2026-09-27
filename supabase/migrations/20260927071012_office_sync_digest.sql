-- Return the latest committed digest to the existing authenticated Mac device.
-- No change to financial actions, original documents, or access controls.
create or replace function office_private.mac_exchange(p_token text,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare device office_private.mac_devices%rowtype; result jsonb; s jsonb; r jsonb; mode text; table_name text; rows jsonb;
begin
 -- Scheduled device requests do not carry a browser session. Authenticate their separate,
 -- revocable capability and require its owner to remain an active finance admin.
 if p_token is null or length(p_token)<40 or length(p_token)>128 then raise exception 'Device authentication required'; end if;
 select * into device from office_private.mac_devices d where d.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and not d.revoked;
 if not found or not exists(select 1 from public.profiles p where p.id=device.owner_id and p.role::text='admin' and coalesce(p.is_active,true)) then raise exception 'Device authentication required'; end if;
 if auth.uid() is not null and auth.uid()<>device.owner_id then raise exception 'Device owner mismatch'; end if;
 update office_private.mac_devices set last_seen=now() where id=device.id;
 mode=p_request->>'action';
 if mode='health' then
  if p_request#>>'{health,status}' not in ('ok','error') then raise exception 'Invalid health status'; end if;
  insert into office_private.mac_health(device_id,status,last_attempt_at,last_success_at,stage,error_type,blocked,archive_errors,backup_error,backup_at,backup_off_device)
  values(device.id,p_request#>>'{health,status}',now(),case when p_request#>>'{health,status}'='ok' then now() else null end,left(p_request#>>'{health,stage}',40),left(p_request#>>'{health,error_type}',60),greatest(0,coalesce((p_request#>>'{health,blocked}')::int,0)),greatest(0,coalesce((p_request#>>'{health,archive_errors}')::int,0)),coalesce((p_request#>>'{health,backup_error}')::boolean,false),(p_request#>>'{health,backup_at}')::timestamptz,coalesce((p_request#>>'{health,backup_off_device}')::boolean,false))
  on conflict(device_id) do update set status=excluded.status,last_attempt_at=now(),last_success_at=coalesce(excluded.last_success_at,office_private.mac_health.last_success_at),stage=excluded.stage,error_type=excluded.error_type,blocked=excluded.blocked,archive_errors=excluded.archive_errors,backup_error=excluded.backup_error,backup_at=coalesce(excluded.backup_at,office_private.mac_health.backup_at),backup_off_device=excluded.backup_off_device;
  return jsonb_build_object('ok',true);
 elsif mode='backup' then
  -- Fixed allowlist; no mailbox credentials, device tokens, or original PDFs.
  result=jsonb_build_object('version',1,'exported_at',now(),'tables','{}'::jsonb);
  foreach table_name in array ARRAY['workers','profiles','clients','jobs','work_entries','office_contractor_settings','office_rates','office_work_adjustments','office_contact_imports','office_invoice_events','office_mac_receipts','office_client_drafts','office_invoice_mail','office_company_records','office_company_record_events','office_assistant_tasks','office_assistant_conversations','office_assistant_applications','client_invoices','client_invoice_items','worker_invoices','worker_invoice_items'] loop
   execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from public.%I t',table_name) into rows;
   result=jsonb_set(result,array['tables',table_name],rows);
  end loop;
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into rows from office_private.client_allocations t;
  result=jsonb_set(result,array['tables','office_private.client_allocations'],rows);
  return result;
 elsif mode='pull' then
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at,q.id),'[]'::jsonb) into result from (
   select e.* from public.office_invoice_events e left join public.office_mac_receipts r on r.event_id=e.id
   where r.status is distinct from 'applied' order by r.updated_at nulls first,e.created_at,e.id limit 100
  ) q;
  return jsonb_build_object('events',result,'sourceDigest',(select source_digest from public.office_invoice_snapshots order by exported_at desc limit 1));
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

