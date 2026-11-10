-- Disposable database only (20261110000100): no function raises SQLSTATE 40001 any more (PostgREST retries it), the
-- stale refusals answer with PT409 at once, and their messages are unchanged.
do $$
declare n int;err text;msg text;
begin
 select count(*) into n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname in ('public','app_private') and (case when p.prokind='f' then pg_get_functiondef(p.oid) end) like '%errcode=''40001''%';
 if n<>0 then raise exception 'STILL_40001 %',n;end if;
 select count(*) into n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and (case when p.prokind='f' then pg_get_functiondef(p.oid) end) like '%raise exception ''STALE_BRIEF'' using errcode=''PT409''%';
 if n<1 then raise exception 'STALE_BRIEF_NOT_PT409';end if;
 begin raise exception 'STALE_BRIEF' using errcode='PT409';exception when others then get stacked diagnostics err=returned_sqlstate,msg=message_text;end;
 if err<>'PT409' or msg<>'STALE_BRIEF' then raise exception 'PT409_UNUSABLE % %',err,msg;end if;
 if public.studio_stale_error_version()<>'stale-pt409@1' then raise exception 'VERSION';end if;
end $$;
