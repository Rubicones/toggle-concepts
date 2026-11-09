# Work Review: Copy a campaign questionnaire

- **Date:** 2026-11-08
- **Branch:** `feat/copy-campaign-questionnaire`
- **Base commit:** `d50b4a8` (Local Claude S3/S4)

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations added:** None.
- **Why needed and how to apply:** The feature reads existing questionnaire records and uses the existing versioned draft save. There is no database action for this change.
- **Backward compatibility:** Submitted questionnaires and active runs retain their existing records. The copy control is available on editable drafts.

## 2. Summary of Changes

- `app/api/studio/campaigns/[id]/brief/copy/route.ts` lists campaigns with saved questionnaires and reads a selected source within the same workspace. It uses the frozen answers when C1 exists and the saved draft otherwise. It excludes removed campaigns and source attachment bindings.
- `components/studio/copy-brief-button.tsx` provides the campaign picker, explicit replacement action and feedback.
- `components/studio/brief-workspace.tsx` loads copied answers into the existing autosave controller and restores the appropriate scope editor mode.
- `packages/contracts/brief.ts` validates saved questionnaire snapshots and gives copied claims and ordered variants fresh identifiers. The target keeps its own files and budget, and the editor requires confirmation of rights for this campaign.
- `tests/brief.test.ts` covers frozen answer parsing, sparse row order, new identities, and destination files, budget and rights.

## 3. Self-Review & Risk Audit

1. The copy writes a draft through the existing optimistic save guard. Existing C1 records, configuration hashes, request IDs and quote IDs retain their original values. Starting a run remains a separate action.
2. The existing questionnaire schema, body-size limit and submission checks still apply. The copy path adds no model prompt, provider schema or admission policy.
3. Source answers remain editable in the target and reviewable before submission. The copy neither submits approvals nor invokes a model. Compatibility with existing saved answers is determined by the current questionnaire schema.

## 4. Verification Results

- `npm run typecheck`, `npm run lint`, `npm run build` and `git diff --check` passed. The build emitted warnings in existing renderer and storage modules.
- `node --import tsx --test tests/brief.test.ts tests/brief-feel.test.ts tests/brandbook-brief.test.ts` passed 22 of 22.
- `npm test` with local browser permissions passed 709 of 710. The existing font measurement test requires a Playwright headless Chromium binary missing from this Mac.
- Browser smoke against mocked APIs passed. Cancel retained the destination answers. Copy replaced and autosaved them using the current draft version, preserved the target budget and sent no start request. The smoke used a separate loopback port.
- No live model requests, shared database writes, migrations, commits or pushes.
