alter table public.jobs
add column if not exists selected_leading_hand_worker_id uuid references public.profiles(id) on delete set null;

update public.jobs
set selected_leading_hand_worker_id = leading_hand_id
where selected_leading_hand_worker_id is null
  and leading_hand_id is not null;

create index if not exists jobs_selected_leading_hand_worker_id_idx
on public.jobs(selected_leading_hand_worker_id);
