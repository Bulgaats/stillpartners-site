begin;
create temp table paid_test_result(check_name text,passed boolean);
do $$
declare owner_id uuid=gen_random_uuid(); req uuid=gen_random_uuid(); rev uuid=gen_random_uuid(); fail_id uuid=gen_random_uuid(); fail_rev uuid=gen_random_uuid(); second_id uuid=gen_random_uuid(); digest text=repeat('f',64); doc jsonb; before_count integer;
begin
 insert into auth.users(id,email) values(owner_id,'paid-flow-test@example.invalid');
 insert into public.profiles(id,role,full_name,is_active) values(owner_id,'admin','Synthetic Payment Test',true) on conflict(id) do update set role='admin',is_active=true;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 doc=jsonb_build_object('id','synthetic-paid-flow','recordType','invoice','name','Example Supplier','abn','51824753556','currency','AUD','amountCents',10000,'paidCents',0,'approved',false,'duplicateOf','','flags','[]'::jsonb,'payments','[]'::jsonb);
 insert into public.office_invoice_snapshots(source_digest,exported_at,imported_by,payload) values(digest,now()+interval '1 day',owner_id,jsonb_build_object('documents',jsonb_build_array(doc)));
 select count(*) into before_count from public.office_invoice_events;
 perform public.office_mark_invoice_paid(req,rev,'synthetic-paid-flow',digest,4000,'2026-09-25','Actual transfer confirmed','Reviewed by synthetic owner',0);
 if (select count(*) from public.office_invoice_events)<>before_count+2 then raise exception 'First payment and review were not both created'; end if;
 if not exists(select 1 from public.office_invoice_events a join public.office_invoice_events p on p.id=req where a.id=rev and a.created_at<p.created_at) then raise exception 'Mac review ordering failed'; end if;
 insert into paid_test_result values('one action records review and partial payment in Mac order',true);
 perform public.office_mark_invoice_paid(req,rev,'synthetic-paid-flow',digest,4000,'2026-09-25','Actual transfer confirmed','Reviewed by synthetic owner',0);
 if (select count(*) from public.office_invoice_events)<>before_count+2 then raise exception 'Replay duplicated payment'; end if;
 insert into paid_test_result values('stable request retry adds nothing',true);
 begin
  perform public.office_mark_invoice_paid(second_id,gen_random_uuid(),'synthetic-paid-flow',digest,4000,'2026-09-25','Second tab stale payment','Review',0);
  raise exception 'FAIL stale balance accepted';
 exception when others then if sqlerrm like 'FAIL%' then raise; end if;
 end;
 insert into paid_test_result values('stale tab balance rejected',true);
 begin
  perform public.office_mark_invoice_paid(gen_random_uuid(),gen_random_uuid(),'synthetic-paid-flow',repeat('e',64),100,'2026-09-25','Changed snapshot','Review',4000);
  raise exception 'FAIL stale snapshot accepted';
 exception when others then if sqlerrm like 'FAIL%' then raise; end if;
 end;
 insert into paid_test_result values('stale source rejected',true);
 -- A separate invoice tests all-or-nothing failure before any financial event is committed.
 update public.office_invoice_snapshots set payload=jsonb_build_object('documents',jsonb_build_array(doc,jsonb_set(doc,'{id}','"synthetic-atomic-fail"'))) where source_digest=digest;
 begin
  perform public.office_mark_invoice_paid(fail_id,fail_rev,'synthetic-atomic-fail',digest,11000,'2026-09-25','Too much','Review for rollback',0);
  raise exception 'FAIL overpayment accepted';
 exception when others then if sqlerrm like 'FAIL%' then raise; end if;
 end;
 if exists(select 1 from public.office_invoice_events where id in(fail_id,fail_rev)) then raise exception 'Failed payment left an approval'; end if;
 insert into paid_test_result values('overpayment rolls back review and payment together',true);
 begin
  perform public.office_mark_invoice_paid(gen_random_uuid(),gen_random_uuid(),'synthetic-atomic-fail',digest,100,'2099-01-01','Future payment','Review',0);
  raise exception 'FAIL future payment accepted';
 exception when others then if sqlerrm like 'FAIL%' then raise; end if;
 end;
 insert into paid_test_result values('future payment rejected',true);
 perform public.office_mark_invoice_paid(second_id,gen_random_uuid(),'synthetic-paid-flow',digest,6000,'2026-09-26','Remainder confirmed','Already reviewed',4000);
 if (select sum(amount_cents) from public.office_invoice_events where document_id='synthetic-paid-flow' and kind='payment')<>10000 then raise exception 'Split total wrong'; end if;
 insert into paid_test_result values('split payment completes the exact remaining amount',true);
 update public.profiles set role='operations_admin' where id=owner_id;
 begin
  perform public.office_mark_invoice_paid(gen_random_uuid(),gen_random_uuid(),'synthetic-atomic-fail',digest,100,'2026-09-25','Wrong role','Review',0);
  raise exception 'FAIL non-finance permitted';
 exception when others then if sqlerrm like 'FAIL%' then raise; end if;
 end;
 insert into paid_test_result values('non-finance role denied',true);
 if has_function_privilege('anon','public.office_mark_invoice_paid(uuid,uuid,text,text,bigint,date,text,text,bigint)','EXECUTE') then raise exception 'Anonymous execution granted'; end if;
 insert into paid_test_result values('anonymous execution denied',true);
end $$;
select * from paid_test_result;
rollback;