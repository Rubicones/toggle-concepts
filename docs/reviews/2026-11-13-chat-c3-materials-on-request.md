# Work Review: C3 — Materials on request

- **Date:** 2026-11-13
- **Branch:** `claude/cool-goodall-qboh37` (local `work`), not committed
- **Base Commit:** `57acea4`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261113000300_material_budgets.sql` (after `20261113000100` and `20261113000200`).
- **Why Needed:** a new table `studio_material_budgets` (tenant, role, count, tokens) holds each role's per-run material budget set in Models & agents. Roles are checked against the eight that can ask (planning roles, critic, designer); count 0–20, tokens 0–100,000; service role only, as `studio_stage_effort`.
- **How to Apply:** `npx supabase db push`, or run the file in the Supabase SQL Editor (safe to run twice). SQL test (disposable database only): `supabase/tests/material-budgets.sql`. Update the runner (`Install-Toggle.cmd`).
- **Backward Compatibility:** without the table, the defaults in `packages/agents/materials.ts` apply and Models & agents says the update is needed. Budgets are frozen with each run context, so a change applies to new runs only. Materials need a context frozen with a stored brand pack (C2b migrations); every earlier context keeps its exact requests (tested).

## 2. Summary of Changes

The owner's principle: every request carries the compressed brand (the pack); details come only when an agent asks for them, by name; pictures only when they help. Nothing for the AD to switch on.

**The catalogue (C2b, extended).** `packages/brand/brand-pack-contents.ts`: every entry now carries `detail`, the text an agent receives when it asks: each kit section (`kit-direction`, `kit-limits`, one per rule category, and the new `kit-components` from the interface findings), each material (its findings, "Use this" first; a font's family and weight). Pictures keep their stored picture. The catalogue lines in the system text are unchanged.

**Requests, budgets and the ledger.**
- `packages/agents/materials.ts` (new): `planMaterials` (known names only; at most four per request; never twice in one conversation; inside the role's run budget by count and tokens, "not fetched: budget used" otherwise; a name the role fetched before in this run is resent without counting when its conversation started over), the reply text, default budgets, and the two-branch schema for single-answer roles.
- `apps/local-runner/local-claude/materials.ts` (new): the run's ledger on the device (`~/.toggle/local-claude/materials/<run>.jsonl`), `fetchMaterials`, `loadMaterials`; pictures read by content key, hash checked, sent as 1024 px JPEGs.
- `packages/agents/run-context.ts`, `apps/local-runner/local-claude/run-context.ts`, `skills.ts`: contexts frozen with a stored pack also freeze `materials` (catalogue entries and per-role budgets, defaults merged with Models & agents).
- Models & agents: `app/api/studio/skills/route.ts`, `components/studio/skills-panel.tsx` — "Materials on request (shared Local runs)": count and tokens per role, defaults shown.

**Single-answer roles (planning roles, critic).** `apps/local-runner/local-claude/transport.ts`: in a context with materials and a budget above zero, the request's schema becomes two branches (`requestMaterials` with `answer: null`, or `answer` in the role's own schema) and one short instruction follows the task. A request answers the CLI's first call; the app fetches the materials, resumes the same conversation (`--resume`, no fork) with the materials and the role's own schema, and returns that answer. One round only. Usage of both calls is summed in the step's usage (so the existing token allowances count it); the usage line shows "looked at: …". The workflow passes the run (`workflow.ts`, `runtime.ts`); the director's critic only in blocks with `materialsVersion 1`. The brand character request never uses it (no shared context).

**Designer (multi-turn).**
- `packages/director/designer.ts`: `usesMaterials` (engine-kit blocks with `brief.materialsVersion: 1`), schema `designer_turn_v3_materials` (`materials`: up to four names with why); earlier blocks keep `designer_turn_v3` and their exact text. `packages/agents/prompts/designer-v1.ts`: one short MATERIALS paragraph for those blocks only.
- `lib/server/director-start.ts`: new designer quotes of shared Local runs set `materialsVersion: 1`.
- `apps/local-runner/director/designer-loop.ts`: named materials are planned in the turn, arrive with the next turn (text in `materials`, pictures after the render), are marked as in the conversation once that turn is accepted, and are never resent in a continued conversation; `budget.materialsLeft` on every turn; a conversation that starts over may ask again (not counted twice).
- `apps/local-runner/director/worker.ts`, `assets.ts`: with a compact sheet in the run context, the designer's own brand references and logos leave its prefix and become entries (`ref-…`) listed under `references` (owner's answer 2); the full brand sheet stays. The timeline says "The designer looked at: …" with the first picture as thumbnail.

**Settled questions.** (1) The type specimen keeps the first and the last weight; other weights are available as the `kit-typography` entry and the font entries. (2) As above.

**Tests.** `tests/chat-c3-materials.test.ts` (new), `tests/fixtures/fake-claude.mjs` (recorded structured answers, a separate record for a resumed call), `tests/chat-c2b-brand-pack.test.ts` (the catalogue now lists `kit-components`).

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests.** `config_hash`, `requestId`, `quoteId` untouched. New behaviour needs a context frozen with `materials` (new runs) and, for the designer and its critic, a block quoted with `materialsVersion 1`; designer versions 1–3 and older blocks keep their schema, text and request identities (tested). The brand character, OpenRouter runs and `fresh` runs are unchanged.
2. **Size limits.** Planning schemas are unchanged (< 2400, `tests/agent-output.test.ts` passes). The wrapper adds 321 characters, only in the CLI request of new runs. The designer's schema goes from 3,478 to 3,737 characters (it was already above 2,400, as before; the CLI does not apply the provider limit). A material round adds at most four entries (texts ≤ 3,000 characters each, pictures ~1.05k tokens), inside the role's budget.
3. **`AGENTS.md` principles.** Material texts are the brand's own findings and rules, labelled as evidence; the instructions say what to ask for and why, never how to design. No paid calls in tests. No ledger bypass: the round is part of the same reserved step and its usage is counted.
4. **Failure paths.** A material that cannot be read is answered as such; an unknown name is answered "not in the catalogue"; an answer with neither branch is a missing answer (Local recovery asks again). The ledger lives on the run's device; a lost ledger only lets a role ask again.
5. **Not done.** The planning roles' material round is not shown on the run timeline as a separate event (it is on the usage line).

## 4. Verification Results

- `npm run typecheck`: passed. `npm run lint`: passed. `npx next build`: exit 0.
- `node --import tsx --test tests/chat-c*.test.ts tests/designer-*.test.ts tests/local-claude-*.test.ts tests/hero-frame.test.ts tests/agent-output.test.ts`: 207 pass, 0 fail (6 new C3 tests: catalogue entries; budget and limits; schema sizes; one round trip with recorded answers, budget refusal; direct answers and frozen contexts; designer materials across turns).
- `tests/local-*.test.ts tests/brand*.test.ts`: 179 pass. `tests/director-*.test.ts tests/brief-feel*.test.ts`: 217 pass, 1 fail ("AD browser flow", a browser timeout that fails the same way on the base).
- `supabase/tests/material-budgets.sql`: not run (no database here). No live run measured.
