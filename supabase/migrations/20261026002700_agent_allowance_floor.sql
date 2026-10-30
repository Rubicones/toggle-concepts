-- Text agents saved with tiny allowances (for example $0.05) stop every run before the first request:
-- one 16k-token reservation alone exceeds them. Raise saved text-agent allowances to at least $0.50.
-- Affects runs started after this migration; the run budget remains the overall ceiling.
update public.studio_agents
   set step_cap_micro_usd=500000,updated_at=now()
 where step_cap_micro_usd<500000 and role not in ('image','video','model3d');
