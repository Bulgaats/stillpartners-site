alter table public.subcontractor_agreements
add column if not exists user_id uuid references public.profiles(id) on delete cascade,
add column if not exists profile_full_name text,
add column if not exists signature_image_data_url text,
add column if not exists agreement_version text;

update public.subcontractor_agreements
set
  user_id = coalesce(user_id, worker_id),
  profile_full_name = coalesce(profile_full_name, signature_name),
  agreement_version = coalesce(agreement_version, version)
where user_id is null
  or profile_full_name is null
  or agreement_version is null;

create index if not exists subcontractor_agreements_user_signed_idx
on public.subcontractor_agreements(user_id, signed_at desc);
