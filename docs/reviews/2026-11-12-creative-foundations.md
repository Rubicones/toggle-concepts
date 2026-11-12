# Work Review: Creative foundations — audit, craft skills, the designer as default

- **Date:** 2026-11-12
- **Branch:** `feat/creative-foundations`
- **Base Commit:** `b8a4c97`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`.
- **Uses:** `studio_skill_attachments` (20261111000400) and the designer role (20261103000300), both already in `main`.

## 2. Audit: why the drafts were weak

Evidence: three drafts of 12 November (an empty grey room with a strip of light; a grid of crops of a generic capsule; three glowing panels on a shelf, the headline hyphenated "depart-ment").

| # | Finding | Evidence in the code |
|---|---|---|
| 1 | **Drafts were built by the older director + coder pair, without looking.** The director writes a design document it never sees rendered; the coder builds it. The designer pipeline (one designer per direction, sees its renders, settles a hero frame with the critic, revises what it sees) exists but was not the default. | `directorStart(..., pipeline='director')`; `director-workspace.tsx` `useState('director')` ("stays the default for comparisons") |
| 2 | **The knowledge base was three paragraphs.** Agents had principles ("each frame works alone within two seconds") and no craft: nothing on how to build a promise, what stops a thumb, how to set a headline, how to recognise a generic frame. | `packages/agents/skills/` held three skills, none attached by default |
| 3 | **The brand reaches the draft agents as tokens.** `category.key → value`, fonts, logos, references. Nothing asks the agent to turn them into a character (temperament, signature, colour proportions, voice) or tests "recognisable with the logo covered". | `approvedBrandModule` in `packages/director/inputs.ts` |
| 4 | **Nobody judges whether the frame sells or stops.** The critic checks legibility, hierarchy and kit rules. A tidy, empty frame passes. | `director-critic-v1.ts` |
| 5 | **The frames show the model's default look.** Empty lit rooms, glowing rounded panels, a plinth, a generic object as a metaphor, an accent colour as an edge line. The product-as-proof rule exists in the planning text but nothing catches its absence in the render. | the drafts; `productProof` in `creative-method.ts` |
| 6 | **Pictures failed for most of the day** (missing ffmpeg), so the coder drew stand-ins. Fixed earlier (#18, #19, #21). | — |

## 3. Summary of Changes

**The designer pipeline is the default.** `lib/server/director-start.ts` and the draft workspace start with `designer`; `director` stays selectable. The page now always sends its choice.

**Craft skills (universal, no brands, fonts, styles or examples).** Ten skills in `packages/agents/skills/`, about 3,500 tokens together:

| Skill | For | What it teaches |
|---|---|---|
| `brand-character` | every role | read all brand inputs into five things (temperament, signature, colour proportions, speech, substance); the logo-covered test; the kit's rules are limits, character is what you build with |
| `ad-idea` | every role | promise → tension → proof → one turn; a metaphor may frame the product, never replace it; boldness is commitment to one move |
| `one-idea` | every role | one idea per frame |
| `stopping-power` | visual direction, designer, coder, critic | one dominant concrete element; contrast at thumbnail size; fill the frame |
| `type-as-voice` | same | line breaks by sense, no hyphenated headline words, three levels, voice from the kit's type |
| `frame-composition` | same | one structure per frame, recompose per format, relationship before decoration |
| `default-look` | same | eleven signs that a decision was skipped (empty lit room, glowing panels, plinth, generic object, …) and what to do instead |
| `reading-order` | same | first, second, third |
| `final-check` | designer, coder, critic | seven questions on the render, in order; kit-compliant but unidentifiable is not approved |
| `revise-with-reason` | designer, coder | change the least that fixes the named finding |

**Skills are attached by default.** `packages/agents/skill-files.ts`: frontmatter `roles:` gives each skill its default roles; the owner's saved choice in Models & agents wins, including "no role" (saved as `none`). Skills for every role sit in the shared, cached context; the others follow the role's instructions.

## 4. Self-Review & Risk Audit

1. **Digests:** no request identity or quote rule changes. A new block's quote names its pipeline as before.
2. **Caps:** skills are added by the Local transport after admission; each skill ≤ 2,000 tokens, a role's own ≤ 6,000 (tested).
3. **`AGENTS.md`:** the skills are principles and failure signs only; no layout templates, no example styles, no brand, font or design-system names (tested). The designer authors layout as before.

**Limits, stated plainly:**
- Skills apply to **Shared Local runs** only, and a run freezes them when its context is first built: a **new run** is needed. OpenRouter runs do not get them.
- The designer pipeline has passed its tests but not a complete live Local run today.
- Whether these skills are enough is a judgement about pictures; no test can show it. The next drafts are the evidence.
- Not done here: a brand-character step that writes the five points down once per run for every agent to share; an explicit "would this stop a thumb" gate before building.

## 5. Verification Results

- `npm run typecheck`, `npm run lint`: pass.
- `tests/local-chat-shaped.test.ts`: 20/20 (default attachments, owner's choice, "no role", size limits, no examples or names).
- Director, designer, Local, guided and workflow suites: 369 pass, 1 fail ("AD browser flow…", also on `main`).
