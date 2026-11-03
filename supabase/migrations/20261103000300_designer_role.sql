-- Designer pipeline plan, point 4c: the designer role.
-- The designer is one agent per direction that replaces the director and the coder for blocks quoted with
-- brief.designerVersion 1. It runs on the run's visual-direction agent, has its own allowance (role key 'designer')
-- and may use a larger request, up to the cap quoted for its direction (estimates.<direction>.designerRequestInputCap).
-- The functions are edited in place, so every other role, guard and earlier block keeps exactly the rules it had.
begin;
do $$
declare definition text;
 old_roles text:='when ''director'' then ''visual-direction'' when ''assembler''';
 new_roles text:='when ''director'' then ''visual-direction'' when ''designer'' then ''visual-direction'' when ''assembler''';
 old_size text:='coalesce((new.config_snapshot->>''requestInputCap'')::int,0) not in (32768,65536)';
 new_size text:='coalesce((new.config_snapshot->>''requestInputCap'')::int,0) not in (32768,65536) and not (role_key=''designer'' and (new.config_snapshot->>''requestInputCap'')::int between 32768 and coalesce((b.snapshot->''estimates''->(new.config_snapshot->>''directorDirectionId'')->>''designerRequestInputCap'')::int,65536))';
begin
 definition:=pg_get_functiondef('app_private.guard_director_allowance()'::regprocedure);
 -- Applied already: nothing to do (the migration is safe to run twice).
 if position(new_roles in definition)=0 then
  if position(old_roles in definition)=0 or position(old_size in definition)=0 then raise exception 'DIRECTOR_GUARD_VERSION_MISMATCH';end if;
  execute replace(replace(definition,old_roles,new_roles),old_size,new_size);
 end if;
 definition:=pg_get_functiondef('public.studio_extend_director(uuid,uuid,text,text,bigint,uuid,uuid,jsonb)'::regprocedure);
 if position(new_roles in definition)=0 then
  if position(old_roles in definition)=0 then raise exception 'DIRECTOR_EXTEND_VERSION_MISMATCH';end if;
  execute replace(definition,old_roles,new_roles);
 end if;
end $$;
create or replace function public.studio_designer_policy_version() returns text language sql immutable as $$select 'designer@1'::text$$;
revoke all on function public.studio_designer_policy_version() from public,anon,authenticated;
grant execute on function public.studio_designer_policy_version() to service_role;
notify pgrst,'reload schema';
commit;
