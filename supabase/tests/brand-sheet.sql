-- Disposable database only. The brand sheet build queue (migration 20261103000200): request, claim, heartbeat,
-- finish, retry and the attempt limit. Pinning the sheet into the frozen visual-direction payload is covered by the
-- planning tests (tests/brand-sheet.test.ts reads the same pages).
begin;
do $$
#variable_conflict use_variable
declare actor uuid:=gen_random_uuid();tenant uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();other uuid:=gen_random_uuid();submission uuid:=gen_random_uuid();
 b public.studio_brand_sheet_builds;sheet jsonb;n int;
begin
 insert into auth.users(id,email) values(actor,'sheet@example.test');insert into public.tenants(id,name) values(tenant,'Sheet');insert into app_private.tenant_members values(tenant,actor,'producer');
 insert into public.campaigns(id,tenant_id,name,brand,created_by) values(campaign,tenant,'Sheet','x',actor),(other,tenant,'No brandbook','x',actor);
 begin perform public.studio_request_brand_sheet(other,actor);raise exception 'NO_SUBMISSION_ACCEPTED';exception when others then if sqlerrm<>'BRANDBOOK_NOT_SUBMITTED' then raise;end if;end;
 insert into public.studio_brandbook_submissions(id,tenant_id,campaign_id,request_id,version_no,summary,created_by) values(submission,tenant,campaign,gen_random_uuid(),1,'{}',actor);
 insert into public.studio_brandbook_heads(campaign_id,submission_id) values(campaign,submission) on conflict(campaign_id) do update set submission_id=excluded.submission_id;
 begin perform public.studio_request_brand_sheet(campaign,gen_random_uuid());raise exception 'STRANGER_ACCEPTED';exception when others then if sqlstate<>'42501' then raise;end if;end;

 b:=public.studio_request_brand_sheet(campaign,actor);if b.state<>'queued' then raise exception 'NOT_QUEUED';end if;
 perform public.studio_request_brand_sheet(campaign,actor);
 if (select count(*) from public.studio_brand_sheet_builds where submission_id=submission)<>1 then raise exception 'DUPLICATE_BUILD';end if;
 if public.studio_claim_brand_sheet(gen_random_uuid()) is not null then raise exception 'OTHER_TENANT_CLAIMED';end if;
 b:=public.studio_claim_brand_sheet(tenant);if b.state<>'building' or b.attempts<>1 then raise exception 'NOT_CLAIMED';end if;
 if public.studio_claim_brand_sheet(tenant) is not null then raise exception 'CLAIMED_TWICE';end if;
 -- Re-requesting while a live build runs keeps the build.
 perform public.studio_request_brand_sheet(campaign,actor);
 if (select state from public.studio_brand_sheet_builds where submission_id=submission)<>'building' then raise exception 'LIVE_BUILD_RESET';end if;
 if public.studio_heartbeat_brand_sheet(submission,b.lease_token+1) then raise exception 'STALE_HEARTBEAT';end if;
 if not public.studio_heartbeat_brand_sheet(submission,b.lease_token) then raise exception 'HEARTBEAT_REFUSED';end if;

 sheet:=jsonb_build_array(
  jsonb_build_object('section','logo-colour','position',0,'slice',0,'sha256',repeat('1',64),'objectKey','staging/brand-sheet/'||repeat('1',64)||'.png','width',1280,'height',1600),
  jsonb_build_object('section','typography','position',1,'slice',0,'sha256',repeat('2',64),'objectKey','staging/brand-sheet/'||repeat('2',64)||'.png','width',1280,'height',900));
 if public.studio_finish_brand_sheet(submission,b.lease_token+1,sheet,null) then raise exception 'STALE_FINISH';end if;
 begin perform public.studio_finish_brand_sheet(submission,b.lease_token,jsonb_build_array(jsonb_build_object('section','logo-colour','position',0,'slice',0,'sha256',repeat('1',64),'objectKey','elsewhere/x.png','width',1280,'height',1600)),null);
  raise exception 'FOREIGN_KEY_ACCEPTED';exception when check_violation then null;end;
 if not public.studio_finish_brand_sheet(submission,b.lease_token,sheet,null) then raise exception 'FINISH_REFUSED';end if;
 if (select state from public.studio_brand_sheet_builds where submission_id=submission)<>'ready' then raise exception 'NOT_READY';end if;
 select count(*) into n from public.studio_brand_sheets where submission_id=submission;if n<>2 then raise exception 'SHEETS %',n;end if;

 -- A rebuild replaces the pages; a failure is retried until the third attempt, then the build fails.
 perform public.studio_request_brand_sheet(campaign,actor);
 for n in 1..3 loop
  b:=public.studio_claim_brand_sheet(tenant);if b.attempts<>n then raise exception 'ATTEMPT % GOT %',n,b.attempts;end if;
  if not public.studio_finish_brand_sheet(submission,b.lease_token,null,'RENDER_FAILED') then raise exception 'FAILURE_REFUSED';end if;
 end loop;
 if (select state||':'||error_code from public.studio_brand_sheet_builds where submission_id=submission)<>'failed:RENDER_FAILED' then raise exception 'NOT_FAILED';end if;
 if public.studio_claim_brand_sheet(tenant) is not null then raise exception 'FAILED_RECLAIMED';end if;
 if (select count(*) from public.studio_brand_sheets where submission_id=submission)<>2 then raise exception 'READY_PAGES_LOST';end if;
 -- The AD can ask again after a failure.
 b:=public.studio_request_brand_sheet(campaign,actor);if b.state<>'queued' or b.attempts<>0 then raise exception 'NOT_REQUEUED';end if;
 -- An expired lease is claimable again.
 b:=public.studio_claim_brand_sheet(tenant);update public.studio_brand_sheet_builds set lease_until=now()-interval '1 second' where submission_id=submission;
 if public.studio_heartbeat_brand_sheet(submission,b.lease_token) then raise exception 'EXPIRED_HEARTBEAT';end if;
 b:=public.studio_claim_brand_sheet(tenant);if b is null or b.attempts<>2 then raise exception 'EXPIRED_NOT_RECLAIMED';end if;
end $$;
rollback;
