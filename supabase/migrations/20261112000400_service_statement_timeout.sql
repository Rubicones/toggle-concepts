-- The studio's own reads and writes (the app server and the local runner use the service role) were cut off by the
-- default 8-second API time limit: a large saved draft state or a busy database then showed as "The database is taking
-- too long to respond" / "canceling statement due to statement timeout" and stopped a stage. The service role gets 30
-- seconds; browser roles (anon, authenticated) keep their limits. Safe to run twice; skipped where not permitted.
do $$
begin
 alter role service_role set statement_timeout='30s';
exception when others then raise notice 'service_role statement_timeout not changed: %',sqlerrm;
end $$;
notify pgrst,'reload config';
