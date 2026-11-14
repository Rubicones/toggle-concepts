-- Admission audit (docs/reviews/2026-11-14-admission-audit.md): the 3D model step of a designer block.
-- 20261113000500 let a model3d step of an approved designer block skip the C2 rule (directorRole 'model'), but the
-- director allowance guard on studio_agent_steps knew no 'model' role: every such step was refused with
-- DIRECTOR_ROLE_MISMATCH before any money moved, so a 3D model could never be bought. The guard now maps 'model' to
-- the model3d agent, reads the block's own model3d allowance (its approved count and price), and, like pictures,
-- holds the step to that count and price rather than to the text request size and token rules.
-- The function is edited in place, so every other role, guard and earlier block keeps exactly the rules it had.
-- Safe to run twice.
begin;
do $$
declare definition text;
 old_roles text:='when ''resources'' then ''image'' end)';
 new_roles text:='when ''resources'' then ''image'' when ''model'' then ''model3d'' end)';
 old_allowance text:='->''roles''->role_key;';
 new_allowance text:='->''roles''->(case when role_key=''model'' then ''model3d'' else role_key end);';
 old_size text:='if role_key<>''resources'' and exists(';
 new_size text:='if role_key not in (''resources'',''model'') and exists(';
 old_tokens text:='or role_key<>''resources'' and (inputs+';
 new_tokens text:='or role_key not in (''resources'',''model'') and (inputs+';
begin
 definition:=pg_get_functiondef('app_private.guard_director_allowance()'::regprocedure);
 if position(new_roles in definition)=0 then
  if position(old_roles in definition)=0 or position(old_allowance in definition)=0 or position(old_size in definition)=0 or position(old_tokens in definition)=0 then raise exception 'DIRECTOR_GUARD_VERSION_MISMATCH';end if;
  execute replace(replace(replace(replace(definition,old_roles,new_roles),old_allowance,new_allowance),old_size,new_size),old_tokens,new_tokens);
 end if;
end $$;
create or replace function public.studio_director_model_steps_version() returns text language sql immutable as $$select 'director-model-steps@1'::text$$;
revoke all on function public.studio_director_model_steps_version() from public,anon,authenticated;
grant execute on function public.studio_director_model_steps_version() to service_role;
notify pgrst,'reload schema';
commit;
