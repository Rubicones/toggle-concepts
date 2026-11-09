# Work Review: Role effort — high for creative roles, medium for the rest

- **Date:** 2026-11-09
- **Branch:** `feat/role-effort` (created on top of the uncommitted `feat/copy-campaign-questionnaire` working tree, at the owner's request)
- **Base Commit:** `d50b4a8`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** —
- **How to Apply:** —
- **Backward Compatibility:** Runs and live-draft blocks started before this change keep their exact reasoning settings (see §3).

**Owner action:** Models & agents → **Update instructions** (version `2026-11-09.2`), then start a new run. Planning roles use role effort only on runs whose frozen instructions carry `2026-11-09.2` or later. Live-draft blocks use it when they start after this change (`brief.effortVersion: 1`).

## 2. Summary of Changes

**The bug.** `staticCoderReasoning` walked `low → max` and returned the first level a model supported, so the coder always ran at `low`. No other role set an effort. Flash roles carried `disableReasoning`, which the Local Claude transport turned into "no --effort flag", so locally they ran at the CLI default.

**The rule.** Creative roles think at **high**: strategy, script, visual-direction, creative-code, layout, critic, plus the draft roles designer, director, assembler and critic. Supporting roles think at **medium**: intake, brand-kit, research, variants, localization. Media roles (image, video, model3d) get nothing.

- `packages/agents/effort.ts` (new). The single rule:
  - `roleEffort(role)` returns the role's level.
  - `supportedEffort(wanted, model)` picks the wanted level if the model offers it, else the closest offered level below it, else the lowest offered level above it. A model without an advertised list gets the wanted level; a model that doesn't reason gets nothing.
  - `roleReasoning(role, model, mode)`:
    - Local Claude: always the role level (→ `--effort`), including roles whose target model is Flash.
    - OpenRouter: Flash keeps reasoning off (unchanged); other models get `supportedEffort`.
  - `usesRoleEffort(instructions)` is the version gate (`ROLE_EFFORT_VERSION = 2026-11-09.2`). `DRAFT_EFFORT_VERSION = 1` is the block flag.
  - `effortLabel(role)` gives the plain words shown in Models & agents.
- `packages/agents/defaults.ts`: `AGENT_INSTRUCTION_VERSION` bumped `2026-11-09.1 → 2026-11-09.2`. The instruction text is otherwise unchanged.
- `apps/local-runner/workflow.ts`: planning and creative workflow jobs use `roleReasoning(job.role, model, execution.mode)` when the run's frozen instructions pass the gate; otherwise they keep the earlier Flash rule exactly.
- `apps/local-runner/brand-field-analysis.ts`: brand-kit reads use the same gate (medium). The frozen-mode lookup (`textExecutionFor`) moved a few lines up, still before any reservation, so the snapshot knows the transport.
- `apps/local-runner/director/worker.ts`:
  - Draft requests in blocks with `brief.effortVersion ≥ 1` use `roleReasoning(role, …)` for designer, director, coder and critic (all high).
  - Earlier blocks keep the exact earlier rule (`staticCoderReasoning` for the coder only).
  - A mid-block model switch keeps the block's output caps.
- `packages/director/roles.ts`: new `thinkingOutputCaps` (director 32 000, assembler 32 000, critic 16 000). On Claude, thinking counts toward the output limit; at high effort the old caps (12 000 / 8 000 / 8 000) would leave too little room for the answer.
- `packages/director/role-models.ts`: `draftModelConfig(..., {thinking})` chooses between the two cap sets, never above the model maximum.
- `lib/server/director-start.ts`: new blocks start with `effortVersion: 1` and the thinking caps (director, assembler, critic).
- `components/studio/workspace-pages.tsx`: every text role in Models & agents shows "Thinking effort: High — creative role" or "Medium — supporting role", with one line on the fallback and on older runs.
- `tests/role-effort.test.ts` (new, 7 tests):
  - the role table covers every studio role;
  - the closest-lower fallback;
  - Local Claude sends `--effort` for Flash-target roles;
  - OpenRouter Flash stays off;
  - the version gate;
  - the thinking caps and the model maximum;
  - the start flag and the worker gate, including the earlier rule for old blocks.
- `tests/agent-models-tab.test.ts`: expected instruction version updated to `2026-11-09.2`.

## 3. Self-Review & Risk Audit

1. **Frozen `config_hash`, `requestId`, `quoteId`.**
   - Reasoning is part of `semanticInputHash`, so it changes only for new requests on gated runs and blocks.
   - The worker applies it only when `!prior`, so a restarted request reuses its frozen `config_snapshot`.
   - Old runs (instructions < `2026-11-09.2`) and old blocks (no `effortVersion`) take the exact earlier branches.
2. **`DRAFT_INPUT_CAP` and schema limits.**
   - Input size is unchanged, and no schema changed (the `< 2400` test is untouched).
   - Output caps grow only for new draft blocks. On **OpenRouter** this raises the quoted output allowance of a block, roughly ×2.7 for the designer/director and ×4 for the coder: the quote is honest about thinking tokens. In **Local** mode there is no per-token charge.
   - The brand-kit reader keeps its 8 192-token cap. If medium effort pushes a long page to `OUTPUT_TOKEN_LIMIT`, the existing split-and-retry handles it.
3. **`AGENTS.md` principles.** No templates and no prompt text were added. No paid calls happen in tests. Approved copy and facts are untouched.

**Known limits.**
- The timeline does not yet show the effort per request. It is recorded in the request snapshot and the local diagnostics (`--effort` in the CLI argv).
- Planning roles on OpenRouter with Flash still run without reasoning, by the earlier rule. Locally they think at their role level.

## 4. Verification Results

The studio Mac's `node_modules` holds macOS binaries (esbuild, swc) that the Linux check shell cannot run, so verification ran on a copy of the source with a fresh `npm ci` on Linux (Node 22.23.4).

- `npm run typecheck`: **pass**, 0 errors.
- `npx eslint` on every changed file: **pass**.
- `node --import tsx --test tests/role-effort.test.ts tests/agent-models-tab.test.ts tests/design-quality-planning.test.ts tests/local-claude-s1.test.ts tests/local-claude-s2.test.ts`: **36/36 pass**.
- `npm test` (all suites): **714 / 729 pass**. All 15 failures are environment-only and unrelated:
  - 12 × `creative-skeleton`: `artifacts/debug/creative-build-d0/build.json` was not in the copy;
  - 1 × `media`: `public/fixtures/motion.mp4` was excluded from the copy;
  - 1 × `director-draft-lineage`: the check requires the studio Mac;
  - 1 × `director-live-preview`: needs the macOS OS sandbox.

  **Re-run `npm test` on the studio Mac to confirm.**
