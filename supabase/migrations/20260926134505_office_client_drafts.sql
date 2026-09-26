create table public.office_client_drafts (
 id uuid primary key, client_id uuid not null references public.clients(id), period_start date not null, period_end date not null,
 issue_date date not null, due_date date not null, gst_mode text not null check(gst_mode in ('exclusive','inclusive','none')),
 source jsonb not null, source_digest text not null, subtotal_cents bigint not null, gst_cents bigint not null,total_cents bigint not null,
 status text not null default 'draft' check(status in ('draft','approved','cancelled')), invoice_number text unique,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),approved_at timestamptz,cancelled_at timestamptz,cancel_reason text,
 check(period_start<=period_end and issue_date<=due_date),check(subtotal_cents>=0 and gst_cents>=0 and total_cents=subtotal_cents+gst_cents and total_cents>0)
);
create index office_client_drafts_client on public.office_client_drafts(client_id,period_start);
create index office_client_drafts_actor on public.office_client_drafts(created_by);
alter table public.office_client_drafts enable row level security;
revoke all on public.office_client_drafts from anon,authenticated;
grant select on public.office_client_drafts to authenticated;
create policy finance_client_drafts on public.office_client_drafts for select to authenticated using((select public.is_admin()));
create table office_private.client_allocations (draft_id uuid not null references public.office_client_drafts(id),entry_id uuid not null references public.work_entries(id),released_at timestamptz,primary key(draft_id,entry_id));
create unique index office_one_client_allocation on office_private.client_allocations(entry_id) where released_at is null;
alter table office_private.client_allocations enable row level security;
revoke all on office_private.client_allocations from public,anon,authenticated;
create sequence office_private.client_invoice_number;
revoke all on sequence office_private.client_invoice_number from public,anon,authenticated;

create function office_private.client_draft_source(p_client uuid,p_from date,p_to date) returns jsonb language plpgsql security definer set search_path='' as $$
declare company public.clients%rowtype; rows jsonb; r record; line jsonb; n integer:=0;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Finance admin access required';end if;
 if p_from is null or p_to is null or p_from>p_to or p_to-p_from>61 or p_from<'2000-01-01'::date or p_to>(now() at time zone 'Australia/Perth')::date then raise exception 'Choose a completed work period of up to 62 days';end if;
 select * into company from public.clients where id=p_client and is_active;
 if not found then raise exception 'Choose an active client';end if;
 -- Serialize work edits before reading adjustments and rate snapshots.
 perform e.id from public.work_entries e join public.jobs j on j.id=e.job_id where j.client_id=p_client and e.work_date between p_from and p_to order by e.id for update of e;
 rows='[]'::jsonb;
 for r in select e.id,e.worker_id,e.work_date,e.hours,e.updated_at,e.locked,e.approved,j.id as site_id,coalesce(j.site_name,j.title) as site_name,w.full_name,
 coalesce(a.client_hours,e.hours) as client_hours,coalesce(a.contractor_hours,e.hours) as contractor_hours,coalesce(a.agreement_note,'Same as actual hours') as agreement_note,
 rate.id as rate_id,rate.hourly_rate_cents
 from public.work_entries e join public.jobs j on j.id=e.job_id join public.workers w on w.id=e.worker_id
 left join public.office_work_adjustments a on a.work_entry_id=e.id
 left join lateral (select v.id,v.hourly_rate_cents from public.office_rates v where v.worker_id=e.worker_id and v.client_id=p_client and v.kind='client' and v.voided_at is null and v.effective_from<=e.work_date order by v.effective_from desc limit 1) rate on true
 where j.client_id=p_client and e.work_date between p_from and p_to order by e.work_date,j.id,w.full_name,e.id loop
  if r.locked or r.approved or exists(select 1 from office_private.client_allocations ca where ca.entry_id=r.id and ca.released_at is null) then raise exception 'This period contains locked or already invoiced work. Review the dates and existing invoices.';end if;
  if r.hours<0 or r.hours>24 or r.client_hours<0 or r.client_hours>24 or r.hours<>round(r.hours,2) or r.client_hours<>round(r.client_hours,2) then raise exception 'Review invalid work hours before preparing an invoice';end if;
  if r.client_hours>0 and r.rate_id is null then raise exception 'Missing agreed client rate for % on %. Add the rate with its correct effective date.',r.full_name,r.work_date;end if;
  line=jsonb_build_object('entryId',r.id,'workerId',r.worker_id,'fullName',r.full_name,'workDate',r.work_date,'siteId',r.site_id,'siteName',r.site_name,'actualHours',r.hours,'contractorHours',r.contractor_hours,'clientHours',r.client_hours,'agreementNote',r.agreement_note,'updatedAt',r.updated_at,'rateId',r.rate_id,'rateCents',r.hourly_rate_cents,'amountCents',round(r.client_hours*coalesce(r.hourly_rate_cents,0))::bigint);
  rows=rows||jsonb_build_array(line);n=n+1;if n>2000 then raise exception 'Choose a shorter invoice period';end if;
 end loop;
 if n=0 then raise exception 'No work records found for this client and period';end if;
 return jsonb_build_object('clientId',company.id,'clientName',company.name,'clientAbn',coalesce(company.abn,''),'clientEmail',coalesce(company.billing_email,company.email,''),'rows',rows);
end;$$;
revoke all on function office_private.client_draft_source(uuid,date,date) from public,anon,authenticated;

create function office_private.prepare_client_draft(p_id uuid,p_client uuid,p_from date,p_to date,p_gst text,p_issue date,p_due date) returns uuid language plpgsql security definer set search_path='' as $$
declare payload jsonb; digest text; base bigint; tax bigint; sub bigint; total bigint; previous public.office_client_drafts%rowtype;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Finance admin access required';end if;
 if p_id is null or coalesce(p_gst,'') not in ('exclusive','inclusive','none') or p_issue is null or p_due is null or p_issue>(now() at time zone 'Australia/Perth')::date or p_issue<p_to or p_due<p_issue or p_due-p_issue>365 then raise exception 'Check GST treatment, issue date and due date';end if;
 perform pg_advisory_xact_lock(917266);
 select * into previous from public.office_client_drafts where id=p_id;
 if found then
  if previous.client_id<>p_client or previous.period_start<>p_from or previous.period_end<>p_to or previous.gst_mode<>p_gst or previous.issue_date<>p_issue or previous.due_date<>p_due then raise exception 'Request ID was already used for different invoice details';end if;
  return previous.id;
 end if;
 payload=office_private.client_draft_source(p_client,p_from,p_to);
 select sum((x->>'amountCents')::bigint) into base from jsonb_array_elements(payload->'rows') x;
 if base is null or base<=0 then raise exception 'No positive billable amount was found';end if;
 if p_gst='exclusive' then sub=base;tax=round(base::numeric/10);total=sub+tax;
 elsif p_gst='inclusive' then total=base;tax=round(base::numeric/11);sub=total-tax;
 else sub=base;tax=0;total=base;end if;
 digest=encode(extensions.digest(payload::text,'sha256'),'hex');
 insert into public.office_client_drafts(id,client_id,period_start,period_end,issue_date,due_date,gst_mode,source,source_digest,subtotal_cents,gst_cents,total_cents,created_by)
 values(p_id,p_client,p_from,p_to,p_issue,p_due,p_gst,payload,digest,sub,tax,total,auth.uid());
 return p_id;
end;$$;
revoke all on function office_private.prepare_client_draft(uuid,uuid,date,date,text,date,date) from public,anon;
grant execute on function office_private.prepare_client_draft(uuid,uuid,date,date,text,date,date) to authenticated;
create function public.office_prepare_client_draft(p_id uuid,p_client uuid,p_from date,p_to date,p_gst text,p_issue date,p_due date) returns uuid language sql security invoker set search_path='' as $$select office_private.prepare_client_draft(p_id,p_client,p_from,p_to,p_gst,p_issue,p_due);$$;
revoke all on function public.office_prepare_client_draft(uuid,uuid,date,date,text,date,date) from public,anon;
grant execute on function public.office_prepare_client_draft(uuid,uuid,date,date,text,date,date) to authenticated;

create function office_private.approve_client_draft(p_id uuid,p_digest text) returns text language plpgsql security definer set search_path='' as $$
declare d public.office_client_drafts%rowtype; current_source jsonb; n text;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Finance admin access required';end if;
 perform pg_advisory_xact_lock(917266);select * into d from public.office_client_drafts where id=p_id for update;
 if not found or d.status='cancelled' or d.source_digest is distinct from p_digest then raise exception 'Reload the current invoice draft before approving';end if;
 if d.status='approved' then return d.invoice_number;end if;
 current_source=office_private.client_draft_source(d.client_id,d.period_start,d.period_end);
 if encode(extensions.digest(current_source::text,'sha256'),'hex')<>d.source_digest then raise exception 'Work records, rates or client details changed. Cancel this draft and prepare a fresh one.';end if;
 n='SP-OFFICE-'||extract(year from d.issue_date)::text||'-'||lpad(nextval('office_private.client_invoice_number')::text,6,'0');
 insert into office_private.client_allocations(draft_id,entry_id) select p_id,(x->>'entryId')::uuid from jsonb_array_elements(d.source->'rows') x;
 update public.work_entries set locked=true,updated_at=clock_timestamp() where id in(select entry_id from office_private.client_allocations where draft_id=p_id and released_at is null);
 update public.office_client_drafts set status='approved',invoice_number=n,approved_at=now() where id=p_id;
 insert into public.audit_logs(actor_id,entity_table,entity_id,action,metadata) values(auth.uid(),'office_client_drafts',p_id,'office.client_invoice_approved',jsonb_build_object('invoice_number',n,'source_digest',d.source_digest,'total_cents',d.total_cents));
 return n;
end;$$;
revoke all on function office_private.approve_client_draft(uuid,text) from public,anon;
grant execute on function office_private.approve_client_draft(uuid,text) to authenticated;
create function public.office_approve_client_draft(p_id uuid,p_digest text) returns text language sql security invoker set search_path='' as $$select office_private.approve_client_draft(p_id,p_digest);$$;
revoke all on function public.office_approve_client_draft(uuid,text) from public,anon;
grant execute on function public.office_approve_client_draft(uuid,text) to authenticated;

create function office_private.cancel_client_draft(p_id uuid,p_reason text,p_unsent boolean) returns void language plpgsql security definer set search_path='' as $$
declare d public.office_client_drafts%rowtype;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Finance admin access required';end if;
 if length(trim(coalesce(p_reason,'')))<3 or length(p_reason)>1000 then raise exception 'Enter a reason for cancellation';end if;
 perform pg_advisory_xact_lock(917266);select * into d from public.office_client_drafts where id=p_id for update;
 if not found then raise exception 'Invoice draft not found';end if;
 if d.status='cancelled' then return;end if;
 if d.status='approved' and p_unsent is distinct from true then raise exception 'Only cancel an approved invoice after confirming it has never been sent. Sent invoices require a separate correction process.';end if;
 if d.status='approved' then
  update public.work_entries set locked=false,updated_at=clock_timestamp() where id in(select entry_id from office_private.client_allocations where draft_id=p_id and released_at is null);
  update office_private.client_allocations set released_at=now() where draft_id=p_id and released_at is null;
 end if;
 update public.office_client_drafts set status='cancelled',cancelled_at=now(),cancel_reason=trim(p_reason) where id=p_id;
 insert into public.audit_logs(actor_id,entity_table,entity_id,action,metadata) values(auth.uid(),'office_client_drafts',p_id,'office.client_invoice_cancelled',jsonb_build_object('reason',p_reason,'owner_confirmed_never_sent',p_unsent,'previous_status',d.status));
end;$$;
revoke all on function office_private.cancel_client_draft(uuid,text,boolean) from public,anon;
grant execute on function office_private.cancel_client_draft(uuid,text,boolean) to authenticated;
create function public.office_cancel_client_draft(p_id uuid,p_reason text,p_unsent boolean) returns void language sql security invoker set search_path='' as $$select office_private.cancel_client_draft(p_id,p_reason,p_unsent);$$;
revoke all on function public.office_cancel_client_draft(uuid,text,boolean) from public,anon;
grant execute on function public.office_cancel_client_draft(uuid,text,boolean) to authenticated;
