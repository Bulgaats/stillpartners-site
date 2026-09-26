
alter table office_private.mac_devices add column gmail_send_ready boolean not null default false, add column gmail_checked_at timestamptz;
create table public.office_invoice_mail (
 id uuid primary key,invoice_id uuid not null references public.office_client_drafts(id),created_by uuid not null references auth.users(id),
 recipient text not null,subject text not null,body text not null,attachments jsonb not null,content_digest text not null,invoice_digest text not null,
 status text not null default 'preview' check(status in('preview','queued','sending','sent','blocked','failed','unknown','cancelled')),
 created_at timestamptz not null default now(),approved_at timestamptz,started_at timestamptz,finished_at timestamptz,lease_id uuid,gmail_id text,message text
);
create index office_mail_owner on public.office_invoice_mail(created_by,created_at);
create unique index office_mail_one_send on public.office_invoice_mail(invoice_id) where status in('queued','sending','sent','unknown');
alter table public.office_invoice_mail enable row level security;
revoke all on public.office_invoice_mail from public,anon,authenticated;
grant select on public.office_invoice_mail to authenticated;
create policy office_mail_owner_read on public.office_invoice_mail for select to authenticated using(created_by=(select auth.uid()) and (select public.is_admin()));

create function office_private.preview_invoice_mail(p_id uuid,p_invoice uuid,p_invoice_digest text,p_recipient text,p_subject text,p_body text,p_attachments jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.office_client_drafts%rowtype; prior public.office_invoice_mail%rowtype; v_recipient text; v_digest text; a jsonb; bytes bytea;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Finance admin access required';end if;
 perform pg_advisory_xact_lock(917266);
 select * into d from public.office_client_drafts where id=p_invoice;
 if not found or d.status<>'approved' or d.source_digest is distinct from p_invoice_digest then raise exception 'Approve the current invoice before preparing its email';end if;
 select lower(trim(coalesce(nullif(billing_email,''),email,''))) into v_recipient from public.clients where id=d.client_id and is_active;
 if coalesce(v_recipient,'') !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' or v_recipient is distinct from lower(trim(p_recipient)) then raise exception 'Review the client billing email in the client record first';end if;
 if p_id is null or length(trim(coalesce(p_subject,''))) not between 1 and 200 or p_subject ~ E'[\r\n]' or length(trim(coalesce(p_body,''))) not between 1 and 8000 then raise exception 'Enter a subject and message';end if;
 if jsonb_typeof(p_attachments) is distinct from 'array' or jsonb_array_length(p_attachments)<>2 or octet_length(p_attachments::text)>3000000 then raise exception 'Invoice and work summary PDFs are required';end if;
 if (p_attachments->0->>'name') is distinct from (d.invoice_number||'.pdf') or (p_attachments->1->>'name') is distinct from (d.invoice_number||'-summary.pdf') then raise exception 'Attachment names do not match this invoice';end if;
 for a in select value from jsonb_array_elements(p_attachments) loop
  if coalesce(a->>'name','') !~ '^[A-Za-z0-9-]+\.pdf$' or coalesce(a->>'sha256','') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid PDF attachment';end if;
  bytes=decode(a->>'data','base64');
  if bytes is null or octet_length(bytes)>2000000 or substring(bytes from 1 for 5)<>convert_to('%PDF-','UTF8') or encode(extensions.digest(bytes,'sha256'),'hex') is distinct from a->>'sha256' then raise exception 'PDF checksum failed';end if;
 end loop;
 v_digest=encode(extensions.digest(jsonb_build_object('recipient',v_recipient,'subject',p_subject,'body',p_body,'attachments',p_attachments)::text,'sha256'),'hex');
 select * into prior from public.office_invoice_mail where id=p_id;
 if found then
  if prior.created_by is distinct from auth.uid() or prior.invoice_id<>p_invoice or prior.content_digest<>v_digest then raise exception 'Email ID already used with different details';end if;
  return p_id;
 end if;
 insert into public.office_invoice_mail(id,invoice_id,created_by,recipient,subject,body,attachments,content_digest,invoice_digest)
 values(p_id,p_invoice,auth.uid(),v_recipient,p_subject,p_body,p_attachments,v_digest,p_invoice_digest);
 return p_id;
end $$;
create function office_private.queue_invoice_mail(p_id uuid,p_digest text) returns void language plpgsql security definer set search_path='' as $$
declare m public.office_invoice_mail%rowtype;d public.office_client_drafts%rowtype;current_email text;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Finance admin access required';end if;
 perform pg_advisory_xact_lock(917266);select * into m from public.office_invoice_mail where id=p_id and created_by=auth.uid() for update;
 if not found or m.content_digest is distinct from p_digest then raise exception 'Review the exact email preview before approving';end if;
 if m.status in('queued','sending','sent') then return;end if;
 if m.status<>'preview' then raise exception 'Prepare and review a new email preview';end if;
 select * into d from public.office_client_drafts where id=m.invoice_id;
 select lower(trim(coalesce(nullif(billing_email,''),email,''))) into current_email from public.clients where id=d.client_id and is_active;
 if d.status<>'approved' or d.source_digest<>m.invoice_digest or current_email is distinct from m.recipient then raise exception 'Invoice or recipient changed. Prepare a fresh preview';end if;
 if exists(select 1 from public.office_invoice_mail where invoice_id=m.invoice_id and status in('queued','sending','sent','unknown')) then raise exception 'This invoice already has a queued, sent or uncertain email. Review history first';end if;
 update public.office_invoice_mail set status='queued',approved_at=now() where id=p_id;
 insert into public.audit_logs(actor_id,entity_table,entity_id,action,metadata) values(auth.uid(),'office_invoice_mail',p_id,'office.email_approved',jsonb_build_object('content_digest',m.content_digest,'invoice_id',m.invoice_id,'recipient',m.recipient));
end $$;
create function office_private.cancel_invoice_mail(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare m public.office_invoice_mail%rowtype;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Finance admin access required';end if;
 perform pg_advisory_xact_lock(917266);select * into m from public.office_invoice_mail where id=p_id and created_by=auth.uid() for update;
 if not found then raise exception 'Email not found';end if;
 if m.status='cancelled' then return;end if;
 if m.status not in('preview','queued','blocked','failed') then raise exception 'Sending has started or may have completed. Check Gmail Sent before any correction';end if;
 update public.office_invoice_mail set status='cancelled',finished_at=now() where id=p_id;
end $$;
create function office_private.mail_exchange(p_token text,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare dev office_private.mac_devices%rowtype;m public.office_invoice_mail%rowtype;d public.office_client_drafts%rowtype;v_ready boolean;current_email text;v_status text;
begin
 select * into dev from office_private.mac_devices where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and not revoked;
 if not found or (auth.uid() is not null and auth.uid()<>dev.owner_id) or not exists(select 1 from public.profiles where id=dev.owner_id and role='admin' and is_active) then raise exception 'Device access denied';end if;
 perform pg_advisory_xact_lock(917266);
 if p_request->>'action'='claim' then
  v_ready=coalesce((p_request->>'can_send')::boolean,false);
  if dev.gmail_send_ready is distinct from v_ready or dev.gmail_checked_at is null or dev.gmail_checked_at<now()-interval '5 minutes' then
   update office_private.mac_devices set gmail_send_ready=v_ready,gmail_checked_at=now() where id=dev.id;
  end if;
  update public.office_invoice_mail set status='unknown',message='Sending confirmation is missing. Check Gmail Sent; automatic resend is disabled.' where created_by=dev.owner_id and status='sending' and started_at<now()-interval '10 minutes';
  if not v_ready then return '{}'::jsonb;end if;
  select * into m from public.office_invoice_mail where created_by=dev.owner_id and status='queued' order by approved_at,id for update skip locked limit 1;
  if not found then return '{}'::jsonb;end if;
  select * into d from public.office_client_drafts where id=m.invoice_id;
  select lower(trim(coalesce(nullif(billing_email,''),email,''))) into current_email from public.clients where id=d.client_id and is_active;
  if d.status<>'approved' or d.source_digest<>m.invoice_digest or current_email is distinct from m.recipient then
   update public.office_invoice_mail set status='blocked',message='Invoice or recipient changed. Prepare a fresh preview.' where id=m.id;return '{}'::jsonb;
  end if;
  update public.office_invoice_mail set status='sending',started_at=now(),lease_id=gen_random_uuid() where id=m.id returning * into m;
  return to_jsonb(m)||jsonb_build_object('client_id',d.client_id,'client_name',d.source->>'clientName');
 elsif p_request->>'action'='complete' then
  v_status=p_request->>'status';
  if v_status not in('sent','failed','blocked','unknown') or v_status is null or length(coalesce(p_request->>'message',''))>400 then raise exception 'Invalid send result';end if;
  if v_status='sent' and coalesce(p_request->>'gmail_id','')!~'^[A-Za-z0-9_-]{1,200}$' then raise exception 'Gmail confirmation is required';end if;
  update public.office_invoice_mail set status=v_status,gmail_id=p_request->>'gmail_id',message=p_request->>'message',finished_at=now()
   where id=(p_request->>'id')::uuid and lease_id=(p_request->>'lease_id')::uuid and created_by=dev.owner_id and status in('sending','unknown');
  return jsonb_build_object('ok',found);
 end if;
 raise exception 'Unsupported mail action';
end $$;
create function office_private.mail_capability() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Finance admin access required';end if;
 return coalesce((select jsonb_build_object('ready',gmail_send_ready,'checkedAt',gmail_checked_at,'device',name) from office_private.mac_devices where owner_id=auth.uid() and not revoked order by gmail_checked_at desc nulls last limit 1),jsonb_build_object('ready',false));
end $$;

revoke all on function office_private.preview_invoice_mail(uuid,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function office_private.preview_invoice_mail(uuid,uuid,text,text,text,text,jsonb) to authenticated;
create function public.office_preview_invoice_mail(p_id uuid,p_invoice uuid,p_invoice_digest text,p_recipient text,p_subject text,p_body text,p_attachments jsonb) returns uuid language sql security invoker set search_path='' as $$select office_private.preview_invoice_mail(p_id,p_invoice,p_invoice_digest,p_recipient,p_subject,p_body,p_attachments);$$;
revoke all on function public.office_preview_invoice_mail(uuid,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.office_preview_invoice_mail(uuid,uuid,text,text,text,text,jsonb) to authenticated;

revoke all on function office_private.queue_invoice_mail(uuid,text) from public,anon,authenticated;
grant execute on function office_private.queue_invoice_mail(uuid,text) to authenticated;
create function public.office_queue_invoice_mail(p_id uuid,p_digest text) returns void language sql security invoker set search_path='' as $$select office_private.queue_invoice_mail(p_id,p_digest);$$;
revoke all on function public.office_queue_invoice_mail(uuid,text) from public,anon,authenticated;
grant execute on function public.office_queue_invoice_mail(uuid,text) to authenticated;

revoke all on function office_private.cancel_invoice_mail(uuid) from public,anon,authenticated;
grant execute on function office_private.cancel_invoice_mail(uuid) to authenticated;
create function public.office_cancel_invoice_mail(p_id uuid) returns void language sql security invoker set search_path='' as $$select office_private.cancel_invoice_mail(p_id);$$;
revoke all on function public.office_cancel_invoice_mail(uuid) from public,anon,authenticated;
grant execute on function public.office_cancel_invoice_mail(uuid) to authenticated;

revoke all on function office_private.mail_exchange(text,jsonb) from public,anon,authenticated;
grant execute on function office_private.mail_exchange(text,jsonb) to anon,authenticated;
create function public.office_mail_exchange(p_token text,p_request jsonb) returns jsonb language sql security invoker set search_path='' as $$select office_private.mail_exchange(p_token,p_request);$$;
revoke all on function public.office_mail_exchange(text,jsonb) from public,anon,authenticated;
grant execute on function public.office_mail_exchange(text,jsonb) to anon,authenticated;

revoke all on function office_private.mail_capability() from public,anon,authenticated;
grant execute on function office_private.mail_capability() to authenticated;
create function public.office_mail_capability() returns jsonb language sql security invoker set search_path='' as $$select office_private.mail_capability();$$;
revoke all on function public.office_mail_capability() from public,anon,authenticated;
grant execute on function public.office_mail_capability() to authenticated;
create or replace function office_private.cancel_client_draft(p_id uuid,p_reason text,p_unsent boolean) returns void language plpgsql security definer set search_path='' as $$
declare d public.office_client_drafts%rowtype;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Finance admin access required';end if;
 if length(trim(coalesce(p_reason,'')))<3 or length(p_reason)>1000 then raise exception 'Enter a reason for cancellation';end if;
 perform pg_advisory_xact_lock(917266);select * into d from public.office_client_drafts where id=p_id for update;
 if not found then raise exception 'Invoice draft not found';end if;
 if d.status='cancelled' then return;end if;
 if exists(select 1 from public.office_invoice_mail where invoice_id=p_id and status in('queued','sending','sent','unknown')) then raise exception 'Cancel any queued email first. Sent or uncertain emails require a correction review.';end if;
 if d.status='approved' and p_unsent is distinct from true then raise exception 'Only cancel an approved invoice after confirming it has never been sent. Sent invoices require a separate correction process.';end if;
 if d.status='approved' then
  update public.work_entries set locked=false,updated_at=clock_timestamp() where id in(select entry_id from office_private.client_allocations where draft_id=p_id and released_at is null);
  update office_private.client_allocations set released_at=now() where draft_id=p_id and released_at is null;
 end if;
 update public.office_client_drafts set status='cancelled',cancelled_at=now(),cancel_reason=trim(p_reason) where id=p_id;
 insert into public.audit_logs(actor_id,entity_table,entity_id,action,metadata) values(auth.uid(),'office_client_drafts',p_id,'office.client_invoice_cancelled',jsonb_build_object('reason',p_reason,'owner_confirmed_never_sent',p_unsent,'previous_status',d.status));
end;$$;
