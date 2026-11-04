-- Brand library follow-up: a campaign that uses another campaign's brand can start its run.
-- 20261102000200 made brand reads follow app_private.brand_scope(), but studio_start_guided_run still looked for a
-- submitted brandbook on the run's own campaign, so a campaign with a library brand stopped with BRANDBOOK_REQUIRED.
-- The run now pins the brand source's submitted brandbook (lib/server/brandbook-a1.ts already reads it in scope).
-- Edited in place; safe to run twice; stops without changes if the function is not the expected version.
begin;
do $$
declare d text;
 old_read text:='select submission_id into book from public.studio_brandbook_heads where campaign_id=r.campaign_id;';
 new_read text:='select submission_id into book from public.studio_brandbook_heads where campaign_id=app_private.brand_scope(r.campaign_id);';
begin
 d:=pg_get_functiondef('public.studio_start_guided_run(uuid,uuid)'::regprocedure);
 if position(new_read in d)>0 then return;end if;
 if position(old_read in d)=0 then raise exception 'GUIDED_RUN_START_VERSION_MISMATCH';end if;
 execute replace(d,old_read,new_read);
end $$;
notify pgrst,'reload schema';
commit;
