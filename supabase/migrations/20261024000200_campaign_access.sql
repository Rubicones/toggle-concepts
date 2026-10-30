-- Producer-controlled assignment; user metadata cannot grant membership.
create function public.campaign_access(target_campaign uuid) returns table(user_id uuid,email text,role text,assigned boolean)
language plpgsql stable security definer set search_path='' as $$
declare c public.campaigns;
begin
  select * into c from public.campaigns where id=target_campaign;
  if not found or app_private.tenant_role(c.tenant_id) is null or app_private.tenant_role(c.tenant_id) not in ('owner','producer') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  return query select m.user_id,u.email::text,m.role,exists(select 1 from app_private.campaign_members cm where cm.tenant_id=c.tenant_id and cm.campaign_id=c.id and cm.user_id=m.user_id)
    from app_private.tenant_members m join auth.users u on u.id=m.user_id where m.tenant_id=c.tenant_id and m.role in ('art_director','client') order by u.email;
end $$;
create function public.set_campaign_access(target_campaign uuid,target_user uuid,allow_access boolean) returns void
language plpgsql security definer set search_path='' as $$
declare c public.campaigns; member_role text; changed boolean;
begin
  select * into c from public.campaigns where id=target_campaign for update;
  if not found or app_private.tenant_role(c.tenant_id) is null or app_private.tenant_role(c.tenant_id) not in ('owner','producer') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select role into member_role from app_private.tenant_members where tenant_id=c.tenant_id and user_id=target_user;
  if member_role is null or member_role not in ('client','art_director') or allow_access is null then raise exception 'INVALID_MEMBERSHIP' using errcode='22023'; end if;
  if allow_access then
    insert into app_private.campaign_members(tenant_id,campaign_id,user_id,access_role)
      values(c.tenant_id,c.id,target_user,case when member_role='client' then 'client' else 'studio' end) on conflict do nothing;
    changed:=found;
  else
    delete from app_private.campaign_members where tenant_id=c.tenant_id and campaign_id=c.id and user_id=target_user; changed:=found;
  end if;
  if changed then perform app_private.record_event(c.tenant_id,c.id,case when allow_access then 'campaign.access_granted' else 'campaign.access_revoked' end,target_user); end if;
end $$;
revoke all on function public.campaign_access(uuid),public.set_campaign_access(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.campaign_access(uuid),public.set_campaign_access(uuid,uuid,boolean) to authenticated;
