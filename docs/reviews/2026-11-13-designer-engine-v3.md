# Work Review: Designer version 3 (engine kit) and the live draft bench

- **Date:** 2026-11-13
- **Branch:** `claude/cool-goodall-qboh37` (local `feat/engine-bench`)
- **Base Commit:** `4cdea15`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** Nothing in the database changes. New draft blocks are quoted with `brief.designerVersion: 3`; the database does not read that number.
- **How to Apply:** Nothing to run in Supabase. Update the local runner (`Install-Toggle.cmd`) so the runner and the app carry the same version.
- **Backward Compatibility:** Blocks quoted with `designerVersion` 1 or 2 keep their exact instructions, response schema and loop behaviour. A runner that was not updated treats version 3 as version 2 (hero frame first, no kit); nothing breaks, the new behaviour is simply absent.

## 2. Summary of Changes

Production:
- `remotion/director/kit.ts` (new): the engine kit, neutral mechanics for a draft's `Frame.tsx`: `stage`, `fitText` (measured, sense-aware line breaks, locale-aware capitals), `measure`, `selected`, `contrast`, `readableOn`, `useFonts`. No colours, layouts or components.
- `apps/local-runner/director/workspace.ts`: writes `kit.ts` next to `brand.ts` for version 3 drafts.
- `packages/director/policy.local.ts`, `live-bundle.ts`, `static-assembler.ts`, `worker.ts`: `kit.ts` is a generated workspace file (not linted as agent source, not rewritten by the agent).
- `packages/director/designer.ts`: `usesEngineKit`; turn schema `designer_turn_v3` (`render.more`: up to three more scenes in one render).
- `packages/agents/prompts/designer-v1.ts`: `designerInstructionsV3`: idea first with a turn; every scene shows its own words; the way of making is a deliberate choice (photograph, rendered object, code, interface on a device, infographic, gradients, collage); words are data; formats as their own compositions; picture ids named in results. Versions 1 and 2 untouched.
- `packages/agents/prompts/director-critic-v1.ts`: for version 3 blocks the reviewer also judges the idea and the formats (`liveCriticIdea`).
- `packages/director/designer-context.ts`: version 3 designers read every ordered line per scene, hook and language (`copyByScene`).
- `apps/local-runner/director/designer-loop.ts` (version 3 only): several scenes per render; formats whose revisions are used are left out while the rest render; the hero review waits for the hero's pictures; a turn that changes no code is not refused for a missing `seen`; the hero has more renders; the result of a picture request names its resource id.
- `apps/local-runner/director/worker.ts`: a version 3 review repair round may render again and has five turns.
- `apps/local-runner/director/live-inspect.ts`: **bug fix for every version**: a picture's cutout file was not given to the inspection page, so the designer and the reviewer saw a broken image wherever a cutout was used.
- `lib/server/director-start.ts`: new designer blocks carry `designerVersion: 3`.

Bench (manual, live, never part of `npm test`): `scripts/bench/` — `pipeline-bench.ts` (the production loop against the real CLI, no database, hero critic, end review with one repair round, pictures supplied by hand, `--propose=1`), `sweep.ts`, `brands.ts` (ten invented brands), `sheet.py`, `requests.py`, `README.md`; `draft-bench.ts` and `protocol.ts` are the first, tagged-text experiment kept for comparison.

Tests: `tests/engine-kit.test.ts`, `tests/designer-engine.test.ts`, `tests/bench-protocol.test.ts`; `tests/designer-pipeline.test.ts` (version number); `tests/local-claude-s0.test.ts` (the bench may import the CLI adapter).

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId` on active runs:** not affected. Every behaviour change is behind `designerVersion >= 3`, which only new blocks carry; versions 1 and 2 keep byte-identical instructions and schemas (covered by the existing prompt tests). The one unconditional change is the cutout fix in the inspection page, which changes no request or digest.
2. **`DRAFT_INPUT_CAP` and schema size:** the version 3 context adds `copyByScene` (a few hundred tokens for a typical order; it grows with locales × hooks × scenes). On the bench a first designer request was about 12.6k input tokens. The v3 schema adds one small array; the test asserts it stays small. Not measured against a real run's full brand kit: the first live run should be checked in "Per request".
3. **`AGENTS.md` principles:** the kit holds no look (a test checks for colours, JSX and style objects); instructions name no brand, font, style or example (tests); approved copy stays verbatim and is read as data; pictures still go through the approved count and the ledger in a run. The bench makes live calls only when started by hand and is excluded from automated tests.

Known limits and risks:
- **Not run against the database.** The bench drives the same loop and tools, but the worker path (allowances, auto-extension, picture purchase, hero critic through the ledger) was not exercised live with version 3. The first studio run is that check.
- **3D is still a picture.** A "rendered object" in a draft is a generated still marked `proxyFor: '3d'`; no model or scene exists to animate. Planned next (see `docs/plans/2026-11-13-creative-engine-rebuild.md`, "Next").
- **Restraint can read as empty.** One corporate test brand produced plain figures on paper; the rule that every frame needs a visual event is not strong enough for restrained brands yet.
- **Turn count.** Runs with several picture rounds reached 18 turns; three causes were fixed after those runs and not re-measured live.
- The bench reads brand fonts from Linux system paths (see its README).

## 4. Verification Results

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `node --import tsx --test tests/*.test.ts`: 828 tests, 815 pass, 13 fail. All 13 fail on `main` as well (12 `creative-skeleton` tests that need `artifacts/debug`, and "AD browser flow…").
- `node --import tsx --test tests/designer-*.test.ts tests/hero-frame.test.ts tests/engine-kit.test.ts tests/bench-protocol.test.ts tests/local-claude-s0.test.ts`: all pass.
- Live bench (authorised by the owner; model `claude-sonnet-5-5`, effort high), per direction with three scenes, four formats, three languages, two hooks:
  - code only: 4–7 min, $0.9–1.4 API-equivalent, 0 hard findings, complete (3 brands);
  - with pictures and hero critic: 7–9 min, $1.5–2.1 (4 brands);
  - with the end review and a repair round: 9–11 min, $2.5–3.1 (3 brands complete; one brand did not finish in 18 turns);
  - `--propose=1`: hooks and visuals proposed in about 30 s and $0.05 (2 brands).
  - Five later runs were interrupted by a restart and are not counted.
