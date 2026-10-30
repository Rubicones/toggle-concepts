-- Optional inspection in the Supabase SQL Editor. Read-only; no settings are changed.
-- Run once while diagnosing, not as a polling job.
select name, setting, unit, source
from pg_settings
where name in (
  'log_statement', 'log_min_duration_statement', 'log_min_messages',
  'log_connections', 'log_disconnections', 'log_lock_waits',
  'log_temp_files', 'log_autovacuum_min_duration'
)
order by name;

select current_setting('pgaudit.log', true) as pgaudit_log,
       current_setting('pgaudit.role', true) as pgaudit_role;
