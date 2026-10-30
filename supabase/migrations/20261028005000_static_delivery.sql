begin;
create or replace function public.studio_request_director_delivery(iteration uuid,variant text,acting_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare b public.studio_director_blocks;i public.studio_director_iterations;
begin
 select * into i from public.studio_director_iterations where id=iteration;select * into b from public.studio_director_blocks where id=i.block_id;
 if b.id is null or not app_private.brand_actor(b.tenant_id,b.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 if not exists(select 1 from jsonb_array_elements(b.snapshot->'inputs') d cross join lateral jsonb_array_elements(d->'variants') v where d->>'directionId'=i.direction_id::text and v->>'id'=variant) then raise exception 'UNISSUED_VARIANT';end if;
 if exists(select 1 from public.studio_director_deliveries where iteration_id=iteration and variant_id=variant) then return;end if;
 insert into public.studio_director_render_jobs(iteration_id,variant_id) values(iteration,variant) on conflict(iteration_id,variant_id) do update set status='queued',error_code=null where studio_director_render_jobs.status='failed';
end $$;

notify pgrst,'reload schema';commit;
