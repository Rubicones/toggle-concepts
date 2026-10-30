# Targeted coder notes — 30 October 2026

## Behavior

New coder corrections continue from existing authored source. The latest AD note and its captured scene, moment, copy axes and dimensions define the requested correction. Earlier notes and the director document remain context; they are not instructions to recreate the component. Preserve unrelated composition, typography, images, options, scenes and adaptive logic. Shared changes are permitted when needed for the requested correction, without an application layout planner.

The code path previously always told the coder to write `Frame.tsx` first and required it on the first response of a new revision. Fresh revision workspaces also lack the previous local square-checkpoint file, so their construction focus could tell the coder to resolve square design again. These instructions now distinguish new components from existing source. A CSS/helper-only correction can change that file alone. Existing-source repair context explicitly says to continue rather than restart square-first construction; actual source checks still run.

The files-response protocol additionally accepts `files: []` plus exact `edits: [{path, oldText, newText}]`. Edits apply only to current authored files with a unique exact anchor. There is no fuzzy matching or host-authored layout decision. All edits are validated before writes, and the app rejects stale source, missing/ambiguous anchors, no-op edits or conflicting replacement/edit operations. Ordinary source policy, write logging, typecheck, build, readiness and completion checks remain active. Required new files or a genuinely necessary larger replacement can still use the compatible full-file path; unchanged content must be preserved.

A new note's selected recipient is recorded in its new continuation snapshot. A coder-only note reuses the existing design even when historical notes include director feedback. Running coder controls already retain the current design through their revision lineage. Old frozen requests and file-only responses remain compatible; no historical request or receipt is rewritten.

The tool fallback remains bounded and can read/write affected authored files when full inline context does not fit. Targeted editing does not grant new requests, broaden ordered copy or facts, regenerate pictures, approve creative work or guarantee visual correctness.

## Verification

- Typecheck, ESLint and optimized Next production build: passed.
- Complete recorded fixture suite: **465/465 passed**.
- Added coverage for a CSS-only correction leaving Frame unchanged, a narrow scene/aspect-ratio branch edit preserving other code, unique anchors, sibling-edit atomic validation, source changed while an answer was prepared, and coder recipient precedence over historical director notes.
- Existing tests retain draft-first creation, exact-view notes, no paid duplicate recovery, per-request caps, billed allowances and frozen-response compatibility.

No paid verification calls, shared database mutations, migrations, visual inspection, commits or pushes were performed. Repository guidance now distinguishes first creation from targeted source revision. Logs are in `artifacts/creative-quality/targeted-coder-notes-2026-10-30/`.
