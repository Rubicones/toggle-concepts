begin;
create table public.studio_director_deliveries(iteration_id uuid not null references public.studio_director_iterations(id),variant_id text not null,payload jsonb not null,created_at timestamptz not null default now(),primary key(iteration_id,variant_id));
create trigger director_delivery_immutable before update or delete on public.studio_director_deliveries for each row execute function app_private.immutable_revision();
create table public.studio_director_render_jobs(iteration_id uuid not null references public.studio_director_iterations(id),variant_id text not null,status text not null default 'queued' check(status in ('queued','running','ready','failed')),lease_owner uuid,lease_token int not null default 0,lease_until timestamptz,error_code text,created_at timestamptz not null default now(),primary key(iteration_id,variant_id));
alter table public.studio_director_deliveries enable row level security;alter table public.studio_director_render_jobs enable row level security;
revoke all on public.studio_director_deliveries,public.studio_director_render_jobs from public,anon,authenticated,service_role;grant select on public.studio_director_deliveries,public.studio_director_render_jobs to service_role;
create function public.studio_request_director_delivery(iteration uuid,variant text,acting_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare b public.studio_director_blocks;i public.studio_director_iterations;
begin
 select * into i from public.studio_director_iterations where id=iteration;select * into b from public.studio_director_blocks where id=i.block_id;
 if b.id is null or not app_private.brand_actor(b.tenant_id,b.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 if not exists(select 1 from jsonb_array_elements(b.snapshot->'inputs') d cross join lateral jsonb_array_elements(d->'variants') v where d->>'directionId'=i.direction_id::text and v->>'id'=variant) then raise exception 'UNISSUED_VARIANT';end if;
 if exists(select 1 from public.studio_director_deliveries where iteration_id=iteration and variant_id=variant) then return;end if;
 insert into public.studio_director_render_jobs(iteration_id,variant_id) values(iteration,variant) on conflict(iteration_id,variant_id) do nothing;
end $$;
create function public.studio_claim_director_delivery(target_tenant uuid,device uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.studio_director_render_jobs;i public.studio_director_iterations;b public.studio_director_blocks;
begin
 select x.* into j from public.studio_director_render_jobs x join public.studio_director_iterations y on y.id=x.iteration_id join public.studio_director_blocks z on z.id=y.block_id where z.tenant_id=target_tenant and (x.status='queued' or x.status='running' and x.lease_until<now()) order by x.created_at for update of x skip locked limit 1;
 if not found then return null;end if;update public.studio_director_render_jobs set status='running',lease_owner=device,lease_token=lease_token+1,lease_until=now()+interval '2 minutes' where iteration_id=j.iteration_id and variant_id=j.variant_id returning * into j;
 select * into i from public.studio_director_iterations where id=j.iteration_id;select * into b from public.studio_director_blocks where id=i.block_id;return jsonb_build_object('job',to_jsonb(j),'iteration',to_jsonb(i),'block',to_jsonb(b));
end $$;
create function public.studio_heartbeat_director_delivery(iteration uuid,variant text,device uuid,token int) returns void language plpgsql security definer set search_path='' as $$ begin update public.studio_director_render_jobs set lease_until=now()+interval '2 minutes' where iteration_id=iteration and variant_id=variant and lease_owner=device and lease_token=token and status='running';end $$;
create function public.studio_publish_director_delivery(iteration uuid,variant text,document jsonb,device uuid,token int) returns void language plpgsql security definer set search_path='' as $$
declare i public.studio_director_iterations;
begin
 select * into i from public.studio_director_iterations where id=iteration;
 if i.id is null or document->'report'->>'passed' is distinct from 'true' or document->'delivery'->>'programHash' is distinct from i.source_hash or document->'delivery'->>'variantId' is distinct from variant then raise exception 'DELIVERY_CHECKS_REQUIRED';end if;
 if device is not null and not exists(select 1 from public.studio_director_render_jobs where iteration_id=iteration and variant_id=variant and lease_owner=device and lease_token=token and lease_until>now() and status='running') then raise exception 'STALE_DIRECTOR_LEASE';end if;
 if device is null and not exists(select 1 from public.studio_director_work w where w.block_id=i.block_id and w.direction_id=i.direction_id and w.status='running' and w.lease_until>now() and w.iteration_id=i.id) then raise exception 'STALE_DIRECTOR_LEASE';end if;
 if exists(select 1 from public.studio_director_deliveries where iteration_id=iteration and variant_id=variant) then return;end if;
 insert into public.studio_director_deliveries(iteration_id,variant_id,payload) values(iteration,variant,document);
 update public.studio_director_render_jobs set status='ready',lease_until=null where iteration_id=iteration and variant_id=variant;
end $$;
create function public.studio_fail_director_delivery(iteration uuid,variant text,device uuid,token int,reason text) returns void language plpgsql security definer set search_path='' as $$ begin update public.studio_director_render_jobs set status='failed',error_code=left(reason,500),lease_until=null where iteration_id=iteration and variant_id=variant and lease_owner=device and lease_token=token;end $$;
revoke all on function public.studio_request_director_delivery(uuid,text,uuid),public.studio_claim_director_delivery(uuid,uuid),public.studio_heartbeat_director_delivery(uuid,text,uuid,int),public.studio_publish_director_delivery(uuid,text,jsonb,uuid,int),public.studio_fail_director_delivery(uuid,text,uuid,int,text) from public,anon,authenticated;
grant execute on function public.studio_request_director_delivery(uuid,text,uuid),public.studio_claim_director_delivery(uuid,uuid),public.studio_heartbeat_director_delivery(uuid,text,uuid,int),public.studio_publish_director_delivery(uuid,text,jsonb,uuid,int),public.studio_fail_director_delivery(uuid,text,uuid,int,text) to service_role;
notify pgrst,'reload schema';commit;
