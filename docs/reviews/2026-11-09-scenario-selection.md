# One scenario, three visual treatments

The Scenarios step previously prescribed composition, light, camera and motion and supplied three stories to downstream planning. New planning instructions produce three narrative-only options. After their existing idea review, the art director chooses one. Localization and visual direction wait for that choice; the latter produces exactly three distinct visual presentations of the same beats, timing, meaning, hooks, proof and CTA.

The choice belongs to a script job and its output hash. SQL serializes selection with workflow claims, checks campaign authority and review completion, rejects stale choices, and prevents changing a choice once dependent work is claimed. Admission freezes and verifies it again. Script revisions invalidate selection naturally through their job/output lineage. Visual revisions retain the choice. The coordinator waits in review without repeatedly running planning ticks.

The worker saves full upstream evidence but sends only the chosen narrative to localization and visual direction. Returned treatments identify their presentation and common scenario separately; the application validates and stamps source lineage. Draft construction makes three presentation identities carrying the exact selected storyboard and hooks. Translations are shared across these candidates only when localization and visual planning have identical saved selection bindings; final scope/variant IDs remain unchanged. Older planning and admitted drafts remain readable and use their existing contracts.

The scenario critic now checks narrative clarity, distinction, supported proof and copy rather than demanding visual design. Visual review compares three presentations of the selected story. Schema version `agent_output_v1_4` removes scenario visual/motion/asset fields, introduces `beat`, and pins every treatment's `scenarioId`. Instructions explicitly prohibit visual prescriptions in prose too; creative judgment remains with the critic and AD.

## Rollout

Apply `20261109000100_scenario_selection.sql` to the shared database, update instructions in Models & agents, then start a new run or restart planning. Frozen earlier runs are not silently upgraded. This implementation does not apply shared migrations, update hosted settings, run paid generation, commit, or push.

## Verification

- Typecheck and lint passed.
- `npm run build:local` passed, using `.next-m02` without interfering with the running shared-profile development server.
- Recorded suite: 721/722 passed using installed Chrome. The unrelated `brand-font-check` browser test fails its Latin-only font/Cyrillic coverage assertion; default Playwright Chromium is not installed.
- All migrations installed in disposable PostgreSQL; focused SQL selection tests passed for authority, review/choice gating, stale hashes, invalid IDs, idempotency, claim locking and exact admission binding.
- The broader existing SQL harness stops in `restart-guided-run.sql` with `AGENT_NOT_CONFIGURED`, before reaching the new fixture; the focused fixture was therefore run separately.
- Six new recorded tests cover transport projection, exact storyboard reuse, invalid/duplicate treatment bindings, shared localization across three previews, treatment isolation in creative handoff, and versioned schemas/review prompts.
- No visual quality review was performed; that belongs to the AD.
