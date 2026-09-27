-- Separate conversations without deleting or changing existing requests.
create table public.office_assistant_conversations (
 id uuid primary key,
 user_id uuid not null references auth.users(id),
 title text not null check(length(trim(title)) between 1 and 120),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,user_id)
);
alter table public.office_assistant_conversations enable row level security;
revoke all on public.office_assistant_conversations from public,anon,authenticated;
grant select,insert on public.office_assistant_conversations to authenticated;
grant update(title,updated_at) on public.office_assistant_conversations to authenticated;
create policy conversation_read on public.office_assistant_conversations for select to authenticated
 using((select public.is_admin()) and user_id=(select auth.uid()));
create policy conversation_insert on public.office_assistant_conversations for insert to authenticated
 with check((select public.is_admin()) and user_id=(select auth.uid()));
create policy conversation_update on public.office_assistant_conversations for update to authenticated
 using((select public.is_admin()) and user_id=(select auth.uid()))
 with check((select public.is_admin()) and user_id=(select auth.uid()));
create index assistant_conversations_owner_updated on public.office_assistant_conversations(user_id,updated_at desc,id);

alter table public.office_assistant_tasks add column conversation_id uuid;
alter table public.office_assistant_tasks add constraint assistant_conversation_owner
 foreign key(conversation_id,user_id) references public.office_assistant_conversations(id,user_id);
create index assistant_conversation_history on public.office_assistant_tasks(user_id,conversation_id,created_at desc,id desc);

-- Keep pre-existing history together with its original owner and dates.
insert into public.office_assistant_conversations(id,user_id,title,created_at,updated_at)
 select gen_random_uuid(),user_id,'Earlier conversations',min(created_at),max(coalesce(finished_at,created_at))
 from public.office_assistant_tasks group by user_id;
update public.office_assistant_tasks t set conversation_id=c.id
 from public.office_assistant_conversations c where c.user_id=t.user_id;

-- Null conversation IDs remain supported for existing clients and invoice-check jobs.
create function office_private.touch_assistant_conversation() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 update public.office_assistant_conversations set updated_at=now()
 where id=new.conversation_id and user_id=new.user_id;
 return new;
end;$$;
revoke all on function office_private.touch_assistant_conversation() from public,anon;
grant execute on function office_private.touch_assistant_conversation() to authenticated;
create trigger assistant_conversation_activity after insert or update of status on public.office_assistant_tasks
 for each row execute function office_private.touch_assistant_conversation();
