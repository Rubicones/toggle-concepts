# Work Review: Engine rebuild R4a — every ordered variation is switchable in designer drafts

- **Date:** 2026-11-13
- **Branch:** `feat/engine-rebuild-2`
- **Base Commit:** `edc295f`
- **Plan:** `docs/plans/2026-11-13-creative-engine-rebuild.md` (R4, first part)

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`.

## 2. Summary of Changes

- **Symptom:** a brief with three languages showed one in the draft preview.
- **Cause:** the preview offered only the locales, hooks, calls to action and lengths the model listed in its source (`previewOptions`). The designer is instructed to read approved copy by its props, so these axes are data; the list was the only thing that hid them.
- **`packages/director/live-options.local.ts`:** in designer drafts every ordered value of the four axes is offered; the declared ones keep their order and come first. Director + coder drafts are unchanged.

## 3. Self-Review & Risk Audit

1. No request identities, quotes or digests change.
2. No caps or schemas change. More combinations can be opened and measured locally; no model request is added by this.
3. `AGENTS.md`: the app adds no layout; it only lets approved copy be selected.

**Risk:** a component that hard-codes one locale's words will show them for every locale. That is now visible to the AD instead of hidden, and is what the `variation-engine` skill forbids.

## 4. Verification Results

- `npm run typecheck`, `npm run lint`: pass.
- `tests/director-live-preview.test.ts`: 6/6 (new test: designer drafts offer all ordered values; other drafts keep the declared ones).
- Live, preview and designer suites: 108 pass.
