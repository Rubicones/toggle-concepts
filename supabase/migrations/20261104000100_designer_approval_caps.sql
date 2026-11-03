-- Designer pipeline plan, point 4c follow-up: approving a designer quote raises the visual-direction agent cap.
-- 20261028004000 raises each agent's run cap by its role allowance when a director quote is approved, for the role keys
-- director/assembler/critic/resources. A designer quote has no `director` allowance, only `designer` (which runs on the
-- visual-direction agent), so the cap stayed at its planning value and the first designer request stopped with
-- STEP_CAP_REACHED. The visual-direction cap now rises by director + designer allowances. Edited in place; safe to run
-- twice; stops without changes if the function is not the expected version.
-- Blocks approved before this migration keep their caps: raise the visual-direction cap in Run limits (by the
-- designer amount of the quote), then "Retry within approved allowance".
begin;
do $$
declare definition text;
 old_sum text:='select coalesce(sum((value->''roles''->pair.role_key->>''maxCostMicroUsd'')::bigint),0) into allowance from jsonb_each(b.snapshot->''estimates'');';
 new_sum text:='select coalesce(sum(coalesce((value->''roles''->pair.role_key->>''maxCostMicroUsd'')::bigint,0)+case when pair.role_key=''director'' then coalesce((value->''roles''->''designer''->>''maxCostMicroUsd'')::bigint,0) else 0 end),0) into allowance from jsonb_each(b.snapshot->''estimates'');';
begin
 definition:=pg_get_functiondef('app_private.approve_director_before_role_models(uuid,text,bigint,uuid)'::regprocedure);
 if position(new_sum in definition)>0 then return;end if;
 if position(old_sum in definition)=0 then raise exception 'DIRECTOR_APPROVAL_VERSION_MISMATCH';end if;
 execute replace(definition,old_sum,new_sum);
end $$;
notify pgrst,'reload schema';
commit;
