# Work Review: Brand fonts with all weights in drafts

- **Date:** 2026-11-02
- **Branch:** local working copy (owner asked for local work without PRs or merges)
- **Base Commit:** local mirror after `One idea review per step, calibrated send-back`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** n/a. Downloaded files go to the existing object store under `staging/google-fonts/`.
- **How to Apply:** nothing. Takes effect for drafts started after the update.
- **Backward Compatibility:** draft blocks already started keep their frozen inputs. Supplied fonts are still used. Older font materials without `weightRange` behave as before.

## 2. Summary of Changes

- **Evidence:** live drafts rendered the brand family (Schibsted Grotesk) from a single Regular file. The coder asked for weights 700–800 and got thin or synthetic-bold text. Even a variable file would have been declared to the browser as weight 400 only.
- `packages/brand/google-fonts.ts` (new):
  - reads the family names from accepted typography `*Family` rules, ignoring generic and system names;
  - decides whether the supplied files lack regular-plus-bold;
  - parses css2 responses, accepting only one unsplit `fonts.gstatic.com` file per weight.
- `lib/server/google-fonts.ts` (new):
  - downloads each weight (100–900) of a named family when needed;
  - checks the family name in the bytes and stores the file by hash in object storage;
  - returns the files as draft materials.
  - Every failure leaves the materials unchanged.
- `lib/server/director-start.ts`: adds those materials after the Brand Kit materials (and the Noto fallback).
- `packages/brand/font-metadata.ts` (new):
  - font metadata read from the bytes, including the variable `weightRange`;
  - `fontWeightDescriptor`, which gives the CSS weight descriptor (`"400 900"` for a variable file).
- `packages/director/inputs.ts`: brand fonts use `fontWeightDescriptor`, so `FontFace` declares the real weight range.
- `apps/local-runner/extract-brand-file.ts`: newly uploaded variable fonts record `weightRange`.
- `tests/google-fonts.test.ts` (new): family parsing, weight decision, CSS parsing, download with a mocked network and store (real font bytes), offline, wrong family, already-covered family.

## 3. Self-Review & Risk Audit

1. **Digests:** only new draft blocks receive the added materials, at start. Frozen blocks and quotes are unchanged.
2. **Caps:** each file is ≤ 3 MB; there are at most 9 small requests per named family, with 8 s and 15 s timeouts.
3. **AGENTS.md:**
   - The application never chooses a typeface; it completes the one the Brand Kit names.
   - Google Fonts are open-licensed.
   - No paid model calls are added.
   - The sandbox stays offline.
- **Unverified here:** this cloud workspace cannot reach Google Fonts. The css2 parsing assumes a non-browser User-Agent receives one unsplit file per weight. If Google returns subset-split CSS instead, nothing is added and the supplied files are used, so there is no regression. The fallback is to upload the variable font file, which is now declared with its full range for new uploads.

## 4. Verification Results

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `node --import tsx --test tests/google-fonts.test.ts`: 4/4 pass.
- `npm test`: only the 14 pre-existing environmental failures (diffed by name).
