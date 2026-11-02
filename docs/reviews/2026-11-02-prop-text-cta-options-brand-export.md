# Work Review: Prop text, CTA alternatives and a full brandbook export

- **Date:** 2026-11-02
- **Branch:** `feat/brief-feel-ui`
- **Base Commit:** `d5818c0`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Backward Compatibility:** Agent instructions move to `2026-11-02.3`; press "Update instructions" for new runs. Active runs keep their frozen instructions.

## 2. Summary of Changes

- `packages/agents/prompts/director-v1.ts`, `packages/agents/prompts/static-coder.ts`: prop text inside the depicted world (file names, track names, interface labels) is allowed when the director writes it verbatim in the key frame; it never states a benefit, price, offer or CTA. Approved copy rules are otherwise unchanged.
- `packages/agents/defaults.ts`: shared rule — a brief/brand field listing alternatives separated by "/", "|" or "or" (e.g. a CTA "sign up / bring your band") gives options; one option per placement, verbatim, never the joined list. Version `2026-11-02.3`; `tests/agent-models-tab.test.ts` pin updated.
- `components/studio/brief-workspace.tsx`: CTA hint "Several options? Separate them with /; each ad uses one."
- `app/api/studio/campaigns/[id]/brand-export/route.ts` (new, read-only): one JSON with materials and their extraction, analyses, file reads, read parts (request inputs), agent steps (output, usage, prompt preview), all findings with reviews, the latest submitted brandbook, the A1 draft and the latest brand revision. Paged reads; no writes.
- `components/studio/brand-field-workspace.tsx`: "Export full JSON" link in the brandbook step footer.

## 3. Self-Review & Risk Audit

1. Digests: instruction text changes only for runs whose instructions are updated; frozen runs unaffected.
2. Director prompt stays inside the 128-variant size target (test passes); schemas unchanged.
3. No templates; prop text is authored by the director and visible on review; no paid calls.

## 4. Verification Results

- `npm run typecheck`: pass. `eslint` on changed files: pass.
- `node --import tsx --test tests/*.test.ts`: 14 failures, identical to the base (Linux-container environment).
