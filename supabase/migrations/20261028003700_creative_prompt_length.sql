begin;
-- creative@2 scene prompts carry the full positional view (beats × brand compositions × zones), which exceeds the
-- original 16,000-character limit set for hand-written prompts. Requests stay priced from the full prompt text.
alter table public.studio_agent_steps drop constraint if exists studio_agent_steps_prompt_check;
alter table public.studio_agent_steps add constraint studio_agent_steps_prompt_check check(length(prompt) between 1 and 200000);
commit;
