# CLAUDE.md — Operating Instructions for Claude Code

Welcome to **Toggle Creative Studio**. Before reading or writing any code, read [`AGENTS.md`](./AGENTS.md) in full. `AGENTS.md` is the authoritative product, architecture, and governance specification for this repository.

---

## 1. Mandatory Git & Branch Workflow

You **must** follow this workflow on every task without exception:

1. **Sync `main` before starting work:**
   ```bash
   git status -s
   git checkout main
   git pull --ff-only origin main
   ```
   *(If the working tree has uncommitted changes from an active handover, inspect `git status -s` and `git diff` first so you never overwrite in-progress work.)*

2. **Always work in a dedicated branch (never commit directly to `main`):**
   - Create a descriptive branch from the latest `main` before making edits:
     ```bash
     git checkout -b feat/<task-slug>
     # or: git checkout -b fix/<task-slug>
     ```
   - Keep commits focused and atomic on your branch. Do not force-push or rewrite `main`.

3. **Environment note (macOS studio machine):**
   - Use Node `22.22.0` (`nvm use` if needed; see `.nvmrc`).
   - `ripgrep` (`rg`) is not installed in the default PATH on this machine; use `grep -rn` or `find` (or Claude Code's built-in Grep/Glob tools).

---

## 2. Mandatory Work Review & Migration Handoff (`docs/reviews/`)

Every time you complete a task or feature branch, you **must** write a self-review and handoff document in:

```text
docs/reviews/<YYYY-MM-DD>-<task-slug>.md
```

Each review document in `docs/reviews/` **must** use the following structure:

```markdown
# Work Review: <Task Title>

- **Date:** YYYY-MM-DD
- **Branch:** `feat/<task-slug>`
- **Base Commit:** `<short-sha>`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

> State clearly whether the project owner needs to run any SQL migrations in Supabase.

- **Migrations Added:** `None` *(or list exact files in `supabase/migrations/YYYYMMDDHHMMSS_<name>.sql` in execution order)*
- **Why Needed:** *(Explain any new tables, columns, RPCs, or policy version bumps)*
- **How to Apply:**
  - *(Provide the exact command or SQL Editor steps, e.g., `npx supabase db push` or running the specific file against the target database, plus any corresponding SQL test in `supabase/tests/<name>.sql`.)*
- **Backward Compatibility:** *(Confirm whether existing active runs/checkpoints in Supabase continue to work before and after applying the migration.)*

## 2. Summary of Changes

- List every modified or added file with a concise explanation of what changed and why.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

- For each change, explicitly answer:
  1. Can this break frozen `config_hash`, `requestId`, or `quoteId` digests on active runs?
  2. Can this exceed `DRAFT_INPUT_CAP` (`65536`) or provider JSON-schema complexity limits (`< 2400` chars in `tests/agent-output.test.ts`)?
  3. Does it preserve `AGENTS.md` principles (no layout templates, no unapproved paid model calls, no silent mutation of approved copy/facts)?

## 4. Verification Results

- Record the exact commands run (`npm run typecheck`, `npm run lint`, `node --import tsx --test ...`) and their pass/fail counts.
```

---

## 3. Non-Negotiable Repository Rules (Summary from `AGENTS.md`)

1. **No paid model calls in tests or verification:** Never invoke live OpenRouter/Gemini endpoints during automated tests unless the user explicitly authorizes a live smoke test.
2. **No creative templates or host layout engines:** Application code measures, validates, and reports objective geometry/brand/copy findings; the creative agents (`director` and `coder`) author all layout, hierarchy, and responsive adaptation in `Frame.tsx`.
3. **No automatic screenshot sweeps in live drafts:** Do not restore `renderStill` PNG/JPEG screenshot loops across 100+ variants in live drafts (`AGENTS.md` Section 2).
4. **Preserve frozen checkpoints and allowances:** Never mutate accepted C1/A1/A2/C2 checkpoints in place, and never bypass `paidText` ledger reservations (`packages/director/money.ts`) or `directorTextConfig` token/cost ceilings (`apps/local-runner/director/ledger.ts`).
5. **Run verification before finishing:** Always run `npm run typecheck`, `npm run lint`, and the relevant `node --import tsx --test tests/...` suites before writing your review in `docs/reviews/`.
