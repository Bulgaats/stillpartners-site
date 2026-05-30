-- Contractor profile completion fields for invoice-ready worker records.
-- Existing table names stay unchanged for compatibility.

alter table public.workers
add column if not exists email text,
add column if not exists abn text,
add column if not exists bank_name text,
add column if not exists bsb text,
add column if not exists account_number text,
add column if not exists profile_complete boolean not null default false,
add column if not exists profile_completed_at timestamptz;

update public.workers
set
  profile_complete = (
    nullif(trim(coalesce(full_name, '')), '') is not null
    and nullif(trim(coalesce(email, '')), '') is not null
    and nullif(trim(coalesce(phone, '')), '') is not null
    and nullif(trim(coalesce(abn, '')), '') is not null
    and nullif(trim(coalesce(bank_name, '')), '') is not null
    and nullif(trim(coalesce(bsb, '')), '') is not null
    and nullif(trim(coalesce(account_number, '')), '') is not null
    and gst_registered is not null
  ),
  profile_completed_at = case
    when (
      nullif(trim(coalesce(full_name, '')), '') is not null
      and nullif(trim(coalesce(email, '')), '') is not null
      and nullif(trim(coalesce(phone, '')), '') is not null
      and nullif(trim(coalesce(abn, '')), '') is not null
      and nullif(trim(coalesce(bank_name, '')), '') is not null
      and nullif(trim(coalesce(bsb, '')), '') is not null
      and nullif(trim(coalesce(account_number, '')), '') is not null
      and gst_registered is not null
    )
    then coalesce(profile_completed_at, now())
    else null
  end
where true;

create index if not exists workers_profile_complete_idx
on public.workers(profile_complete);

create index if not exists workers_email_idx
on public.workers(email);

notify pgrst, 'reload schema';
