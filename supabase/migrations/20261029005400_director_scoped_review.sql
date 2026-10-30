begin;
-- Review is an append-only observation of a view, never approval or a paid allowance.
alter table public.studio_director_controls add column target jsonb;
create table public.studio_director_reviews(
 id uuid primary key,block_id uuid not null,direction_id uuid not null,
 action text not null check(action in ('note','reviewed')),target jsonb not null check(jsonb_typeof(target)='object'),
 recipient text,body text,route text not null check(route in ('live','paused','quote')),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 foreign key(block_id,direction_id) references public.studio_director_work(block_id,direction_id),
 check((action='note' and recipient in ('director','assembler') and length(trim(body)) between 1 and 4000) or (action='reviewed' and recipient is null and body is null))
);
create index director_reviews_view on public.studio_director_reviews(block_id,direction_id,(target->>'revision'),(target->>'assetRevision'),created_at,id);
create trigger director_review_immutable before update or delete on public.studio_director_reviews for each row execute function app_private.immutable_revision();
alter table public.studio_director_reviews enable row level security;
revoke all on public.studio_director_reviews from public,anon,authenticated,service_role;
grant select on public.studio_director_reviews to service_role;
create function public.studio_review_director(target_block uuid,direction uuid,request_key uuid,review_action text,review_target jsonb,note_recipient text,note_text text,acting_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare b public.studio_director_blocks;w public.studio_director_work;r public.studio_director_reviews;mode text;
begin
 select * into b from public.studio_director_blocks where id=target_block for update;
 if b.id is null or not app_private.brand_actor(b.tenant_id,b.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 select * into r from public.studio_director_reviews where id=request_key;
 if found then
  if r.block_id<>target_block or r.direction_id<>direction or r.action<>review_action or r.target is distinct from review_target or r.recipient is distinct from note_recipient or r.body is distinct from note_text or r.created_by<>acting_user then raise exception 'REQUEST_CONFLICT';end if;
  return jsonb_build_object('id',r.id,'route',r.route,'reused',true);
 end if;
 select * into w from public.studio_director_work where block_id=target_block and direction_id=direction for update;
 if w.block_id is null then raise exception 'DIRECTION_NOT_FOUND';end if;
 if not coalesce(review_action in ('note','reviewed') and jsonb_typeof(review_target)='object' and review_target->>'version'='1' and review_target->>'blockId'=target_block::text and review_target->>'directionId'=direction::text and (review_target->>'iterationId')~'^[a-f0-9-]{36}$' and (review_target->>'revision')~'^[a-f0-9]{64}$' and (review_target->>'assetRevision')~'^[a-f0-9]{64}$' and jsonb_typeof(review_target->'view')='object' and jsonb_typeof(review_target->'pending')='array' and length(review_target::text)<60000,false) then raise exception 'INVALID_REVIEW_TARGET';end if;
 if exists(select 1 from public.studio_director_iterations where id=(review_target->>'iterationId')::uuid and (block_id<>target_block or direction_id<>direction)) then raise exception 'FORBIDDEN';end if;
 if review_action='note' and (note_recipient is null or note_recipient not in ('director','assembler') or coalesce(length(trim(note_text)),0) not between 1 and 4000) or review_action='reviewed' and (note_recipient is not null or note_text is not null) then raise exception 'INVALID_REVIEW';end if;
 mode:=case when b.status<>'superseded' and w.status in ('queued','running') then 'live' when b.status<>'superseded' and w.status in ('review','waiting') then 'paused' else 'quote' end;
 insert into public.studio_director_reviews(id,block_id,direction_id,action,target,recipient,body,route,created_by) values(request_key,target_block,direction,review_action,review_target,note_recipient,note_text,mode,acting_user);
 if review_action='note' and mode in ('live','paused') then
  insert into public.studio_director_controls(id,block_id,direction_id,action,recipient,body,target,created_by) values(request_key,target_block,direction,'note',note_recipient,note_text,review_target,acting_user);
 end if;
 insert into public.studio_director_events(block_id,direction_id,iteration_id,event_key,payload) values(target_block,direction,(review_target->>'iterationId')::uuid,'review:'||request_key::text,jsonb_build_object('stepId',request_key,'kind','review','status','done','costMicroUsd',0,'model','AD','message',case review_action when 'reviewed' then 'AD marked this exact view reviewed.' else 'Your note is saved against this exact view.' end,'detail',jsonb_build_object('target',review_target,'recipient',note_recipient,'text',note_text)));
 -- Do not resume paused work, select a version, change budgets or call a provider.
 return jsonb_build_object('id',request_key,'route',mode,'reused',false);
end;$$;
revoke all on function public.studio_review_director(uuid,uuid,uuid,text,jsonb,text,text,uuid) from public,anon,authenticated;
grant execute on function public.studio_review_director(uuid,uuid,uuid,text,jsonb,text,text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
