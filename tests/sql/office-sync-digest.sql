-- Synthetic records are rolled back; no real invoice or payment is changed.
begin;
create temp table sync_test_result(check_name text,passed boolean);
do $$
declare owner_id uuid=gen_random_uuid(); token text=gen_random_uuid()::text||gen_random_uuid()::text; digest text=encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex'); result jsonb;
begin
 insert into auth.users(id,email) values(owner_id,'sync-digest-test@example.invalid');
 insert into public.profiles(id,role,full_name,is_active) values(owner_id,'admin','Synthetic Sync Test',true) on conflict(id) do update set role='admin',is_active=true;
 insert into office_private.mac_devices(name,token_hash,owner_id) values('Synthetic Sync Device',encode(extensions.digest(token,'sha256'),'hex'),owner_id);
 insert into public.office_invoice_snapshots(source_digest,exported_at,imported_by,payload) values(digest,now()+interval '1 day',owner_id,'{"documents":[]}'::jsonb);
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claims','{}',true);
 result=public.office_mac_exchange(token,'{"action":"pull"}');
 if result->>'sourceDigest' is distinct from digest or jsonb_typeof(result->'events') is distinct from 'array' then raise exception 'Pull response missing digest or events'; end if;
 insert into sync_test_result values('authenticated device gets latest digest with event array',true);
 begin
  perform public.office_mac_exchange(repeat('invalid',10),'{"action":"pull"}');
  raise exception 'FAIL invalid token accepted';
 exception when others then if sqlerrm like 'FAIL%' then raise; end if;
 end;
 insert into sync_test_result values('invalid device cannot read digest',true);
 update office_private.mac_devices set revoked=true where token_hash=encode(extensions.digest(token,'sha256'),'hex');
 begin
  perform public.office_mac_exchange(token,'{"action":"pull"}');
  raise exception 'FAIL revoked token accepted';
 exception when others then if sqlerrm like 'FAIL%' then raise; end if;
 end;
 insert into sync_test_result values('revoked device cannot read digest',true);
end $$;
select * from sync_test_result;
rollback;
