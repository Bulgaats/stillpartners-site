-- One owner Paid action. Review and payment commit together or both roll back.
create function office_private.mark_invoice_paid(
 p_id uuid,p_review_id uuid,p_document_id text,p_digest text,p_amount bigint,p_day date,
 p_reason text,p_review_reason text,p_expected_paid bigint
) returns uuid language plpgsql security definer set search_path='' as $$
declare s jsonb; d jsonb; digest text; paid bigint; needs_approval boolean; review_time timestamptz;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Finance admin access required'; end if;
 perform pg_advisory_xact_lock(917263);
 -- Stable payment identity makes a retry safe even after a new snapshot arrives.
 if exists(select 1 from public.office_invoice_events where id=p_id) then
  return office_private.record_invoice_event(p_id,p_document_id,'payment',p_digest,p_amount,p_day,p_reason,null);
 end if;
 if p_id is null or p_review_id is null or p_id=p_review_id then raise exception 'Distinct action IDs required'; end if;
 select payload,source_digest into s,digest from public.office_invoice_snapshots order by exported_at desc limit 1;
 if digest is distinct from p_digest then raise exception 'Invoice register changed. Refresh before continuing'; end if;
 select x into d from jsonb_array_elements(s->'documents') x where x->>'id'=p_document_id;
 if d is null then raise exception 'Invoice not found'; end if;
 select coalesce((d->>'paidCents')::bigint,0)+coalesce(sum(e.amount_cents),0) into paid
 from public.office_invoice_events e where e.document_id=p_document_id and e.kind='payment'
 and not exists(select 1 from public.office_invoice_events v where v.target_id=e.id)
 and not exists(select 1 from jsonb_array_elements(d->'payments') x where x->>'id'=e.id::text);
 if p_expected_paid is distinct from paid then raise exception 'Payment balance changed. Refresh before recording another payment'; end if;
 needs_approval=not coalesce((d->>'approved')::boolean,false) and not exists(
  select 1 from public.office_invoice_events e where e.document_id=p_document_id and e.kind='approve' and e.source_digest=p_digest);
 if needs_approval then
  if p_review_reason is null or length(trim(p_review_reason))<3 or length(p_review_reason)>2000 then raise exception 'Review confirmation required'; end if;
  perform office_private.record_invoice_event(p_review_id,p_document_id,'approve',p_digest,null,null,p_review_reason,null);
  review_time=clock_timestamp();
  update public.office_invoice_events set created_at=review_time where id=p_review_id;
 end if;
 perform office_private.record_invoice_event(p_id,p_document_id,'payment',p_digest,p_amount,p_day,p_reason,null);
 -- The Mac must always see the review before the payment, even inside one transaction.
 if needs_approval then update public.office_invoice_events set created_at=greatest(clock_timestamp(),review_time+interval '1 microsecond') where id=p_id; end if;
 return p_id;
end;
$$;
revoke all on function office_private.mark_invoice_paid(uuid,uuid,text,text,bigint,date,text,text,bigint) from public,anon;
grant execute on function office_private.mark_invoice_paid(uuid,uuid,text,text,bigint,date,text,text,bigint) to authenticated;
create function public.office_mark_invoice_paid(
 p_id uuid,p_review_id uuid,p_document_id text,p_digest text,p_amount bigint,p_day date,p_reason text,p_review_reason text,p_expected_paid bigint
) returns uuid language sql security invoker set search_path='' as $$
 select office_private.mark_invoice_paid(p_id,p_review_id,p_document_id,p_digest,p_amount,p_day,p_reason,p_review_reason,p_expected_paid);
$$;
revoke all on function public.office_mark_invoice_paid(uuid,uuid,text,text,bigint,date,text,text,bigint) from public,anon;
grant execute on function public.office_mark_invoice_paid(uuid,uuid,text,text,bigint,date,text,text,bigint) to authenticated;
