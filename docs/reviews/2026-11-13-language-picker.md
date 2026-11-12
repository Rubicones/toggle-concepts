# Work Review: Languages in the brief are chosen by clicking

- **Date:** 2026-11-13
- **Branch:** `feat/locale-picker`
- **Base Commit:** `4325602`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`.

## 2. Summary of Changes

- **`components/studio/brief-workspace.tsx`:** `LanguagePicker` replaces the comma-separated text field. Twenty-four common languages are toggles named in words ("German (Germany)"); a rare language is added by its code. The order of selection is kept (the first is the reference language); at most 8, as the brief allows.
- **`packages/contracts/locale-names.ts`:** `localeName`, `localeCode` (normalises `de-de`, `EL_gr`, `zh-hans-cn`; refuses anything that is not a language code).
- **`app/globals.css`:** styles for the picker.

## 3. Self-Review & Risk Audit

1. The brief stores the same list of codes as before; no digest, schema or request changes.
2. No caps involved.
3. `AGENTS.md`: interface only.

## 4. Verification Results

- `npm run typecheck`, `npm run lint`: pass.
- `tests/language-picker.test.ts`: pass.
- `next build`: compiled successfully.
- Not checked in a browser from here.
