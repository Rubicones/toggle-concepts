# First Task Prompt for Claude — Rendering-Free Draft Critic & Automated Coder Revision Loop

Copy and paste the prompt below directly to Claude Code:

---

```markdown
Read `CLAUDE.md` and `AGENTS.md` first.

Before making any code changes:
1. Check `git status -s`. Make sure you are on the latest `main` (`git pull --ff-only origin main` once any handoff changes are committed) and create a new feature branch: `git checkout -b feat/live-draft-critic`.
2. When you finish this task, write a full review and migration handoff report in `docs/reviews/2026-10-30-live-draft-critic.md` following the exact template in `CLAUDE.md` (explicitly stating at the top whether any Supabase migrations in `supabase/migrations/` need to be applied).

---

## Task: Activate the `critic` Agent for Live Static Drafts (`Frame.tsx`) Without Rendering Variant Screenshots

### Problem & Goal
Right now, live static drafts (`usesLiveDraft(input)` in `apps/local-runner/director/worker.ts` and `estimateLiveDirection` in `packages/director/money.ts`) completely skip the `critic` agent (`roles.critic` is zeroed out, and `seal()` marks the iteration `unchecked: true` immediately after `assembleStatic` finishes).

We need the **`critic` agent** to be an active, crucial quality gate that inspects the coder's `Frame.tsx` work across **all ordered formats, continuous aspect ratios, scenes, moments, and copy variations**, catches both **technical/layout defects** and **aesthetic/art-direction issues** (including how the layout interacts with generated images across different formats and adaptive breakpoints), and **automatically asks the coder (`assembler`) for a revision** when something is wrong.

### Critical Constraint: DO NOT Render Images (`renderStill` / PNG / JPEG Sweeps) for the Critic
A campaign can have **100+ ordered variations** (e.g. 128 variants × 4 scenes = 512 combinations). Rendering PNG/JPEG screenshots for every variant is slow, expensive, and explicitly forbidden in live drafts (`AGENTS.md` Section 2: *"The coder does not render/export draft images. Do not add automatic screenshot sweeps or restore `renderStill` to the live-draft tools."*).

Instead, design and implement a **rendering-free way for the Critic to "see" the layout across all variations and formats**:

### How the Critic Should "See" the Layout Without Rendering Images

Build a **two-layer non-pixel inspection pipeline** that gives the `critic` LLM complete spatial and visual awareness without exporting a single variant screenshot:

#### Layer 1: Deterministic Layout & DOM Geometry Probing (Zero Image Encoding)
Inspect how `apps/local-runner/director/live-preview-entry.tsx`, `apps/local-runner/director/live-bundle.ts`, and `remotion/director/observe.tsx` work.
- Once `Frame.tsx` bundles into `preview.js` / `preview.css`, or via a fast headless DOM/layout probe (e.g., mounting the compiled `Frame` component in a single reusable headless page / JSDOM / `@chenglou/pretext` text-measurement + computed-style pass inside the sandbox child without ever calling `captureScreenshot` or encoding PNG/JPEG bytes):
- Sweep a smart **Representative & Boundary Matrix** of views in milliseconds:
  1. **Every ordered format + continuous adaptive aspect-ratio probes** (e.g., `1080×1080` 1:1 square, `1080×1920` 9:16 vertical, `1920×1080` 16:9 wide, `1080×1350` 4:5 portrait, plus intermediate adaptive widths/heights to verify continuous responsiveness rather than brittle breakpoints).
  2. **Every issued `sceneId` and authored `moment`**.
  3. **Boundary copy variants per locale/hook/CTA/length** (specifically testing the shortest copy, the longest localized strings such as `de-DE`, and any hook with an alternate `variantFacts[v.id].storyboard`), plus verifying verbatim copy presence across all ordered variants.
  4. **Both resource states**: when generated images (`resources[id]`) are pending (`ready: false` placeholder state) and when `resources[id]` are populated (`ready: true` with their actual dimensions/aspect ratios from `state.catalog` / `draft.json`).
- For each probed view, extract a compact **Structured Spatial & Style Telemetry (`LayoutViewTelemetry`)**:
  - **Canvas & Safe Areas:** `{width, height, format, safeArea}` and which elements intrude into platform exclusion zones (`packages/director/inputs.ts` `directorFormats`).
  - **Text Nodes:** exact rendered text, bounding box `{x, y, width, height}` (in canvas coordinates and `%` of canvas), `fontSize`, `fontFamily`, `fontWeight`, `lineHeight`, `color`, effective background color / contrast estimate, line-wrap count, and **overflow/clipping flags** (`scrollWidth > clientWidth`, `scrollHeight > clientHeight`, or bounding box extending outside canvas/container).
  - **Image & Visual Resource Layers (`<Img>`, `<svg>`, resource containers, proxy labels):** bounding box `{x, y, width, height}`, `%` of canvas covered, `objectFit` / `objectPosition`, aspect-ratio crop vs. the resource's authored `aspect`, whether text boxes overlap the central focal area of the image, and whether required proxy labels are visible when `proxy: true`.
  - **Brand Logos (`[data-brand-logo]`):** bounding box, visibility, safe-area compliance, and clear-space distance (`clearSpacePx`) to the nearest text or graphic element.
  - **Collision & Balance Diagnostics:**
    - Pairwise bounding-box intersections (text overlapping text, text overlapping logo, CTA overlapping headline/legal copy).
    - Off-canvas / zero-size elements (`width === 0 || height === 0` or outside `[0, 0, width, height]`).
    - Spatial distribution / dead-space ratio (e.g., detecting if all content collapses into one corner or fails to adapt between `1:1`, `9:16`, and `16:9`).
    - Missing required verbatim copy (`variantFacts[variantId].sceneCopy[sceneId]` and `required`) or unapproved invented text.

#### Layer 2: Structured LLM Aesthetic & Technical Critique (`critic` Role)
Feed the `critic` agent a compact, high-signal **Critic Inspection Dossier** (staying strictly within `DRAFT_INPUT_CAP = 65536` via `compactDraftRequest`):
1. **The Director's `designDocument`, `keyFrames`, and `resources` briefs** (so the critic knows the intended visual hierarchy, staging, lighting, focal subject of each generated image, and responsive adaptation rules).
2. **The Coder's authored source (`Frame.tsx` and any helper `.tsx`/`.css` files)** (so the critic can inspect the actual CSS Grid/Flexbox/SVG/responsive math, typography scales, color tokens, blend modes, and image positioning logic).
3. **The aggregated `LayoutTelemetryReport`** from Layer 1 (highlighting all hard geometry/copy/brand violations plus a spatial layout map of key frames across `1:1`, `9:16`, `16:9`, and longest-copy locales).
4. *(Optional/Zero-Render Vision):* If generated still images (`state.catalog`) have already arrived on disk (`public/<thumbnail>`) and the configured critic model supports vision, you may attach those already-generated resource thumbnails so the critic can see the actual generated pictures and judge how the code's overlays/colors/crops interact with the real image pixels—**without rendering any variant screenshots**.

### Revision Loop Integration
1. **Fast-Path Deterministic Gate Before Paying for Critic:**
   - If Layer 1 finds **strictly broken objective issues** while coder turns remain (e.g., missing verbatim copy, text-on-text collision, text clipped/off-canvas, logo missing, or broken adaptive resize), feed those exact structured findings directly into a coder repair turn (`assembleStatic`) first so the coder fixes obvious geometry errors before spending a paid `critic` call.
2. **Paid `critic` Review & Coder Revision:**
   - Update ` staticCriticInstructions` (or a dedicated `liveStaticCriticInstructions` in `packages/agents/prompts/director-critic-v1.ts`) and `packages/director/critic.ts` so the critic evaluates:
     - **Aesthetic & Art-Direction Quality:** hierarchy, typographic scale/contrast, compositional balance across square/vertical/wide, interplay between typography/UI layers and generated images (`resources`), faithful execution of the director's `designDocument`, and avoidance of flat/broken placeholder layouts.
     - **Technical & Responsive Completeness:** adaptive behavior across formats and continuous dimensions, multi-locale text expansion handling, hook-specific `variantFacts.storyboard` mapping, logo clear space, and safe areas.
   - When `critique.accepted === false`, route coder notes (`recipient: 'assembler'`, with concrete view coordinates `{format, width, height, locale, hook, cta, sceneId, moment}` and actionable instructions targeting `Frame.tsx`) back into `assembleStatic` so the coder applies targeted `{path, oldText, newText}` source edits (`packages/director/source-edits.ts`) and re-bundles/re-checks!
   - Bound the loop to at most **1–2 critic rounds** within explicit token/cost allowances in `packages/director/money.ts` (`estimateLiveDirection` / `estimateStaticDirection`) so it can never loop infinitely or exceed run caps.
   - Ensure **backward compatibility**: existing saved blocks/runs in Supabase whose frozen `estimates` have `roles.critic.requests === 0` must either gracefully skip the paid LLM critic (running only the free deterministic Layer 1 check) or use only the admitted allowance, so existing frozen quotes/blocks never fail with `ROLE_ALLOWANCE_EXHAUSTED` or `CHECKPOINT_CONFIG_MISMATCH`.

### Key Files to Inspect First
- `AGENTS.md` & `CLAUDE.md`
- `apps/local-runner/director/worker.ts` (lines 135–190)
- `apps/local-runner/director/static-assembler.ts`
- `apps/local-runner/director/live-bundle.ts` & `apps/local-runner/director/live-preview-entry.tsx`
- `remotion/director/observe.tsx` & `packages/director/checks.local.ts`
- `packages/director/money.ts` (`estimateStaticDirection`, `estimateLiveDirection`, `paidText`)
- `packages/director/critic.ts` & `packages/agents/prompts/director-critic-v1.ts`
- `packages/director/request-size.ts` (`compactDraftRequest`, `DRAFT_INPUT_CAP`)
- `lib/server/director-start.ts`

### Deliverables & Verification
1. Implement the rendering-free layout telemetry probe + live-draft `critic` review + coder revision loop.
2. Add comprehensive unit/integration tests in `tests/` verifying:
   - Telemetry extraction detects overlapping text, off-canvas clipping, safe-area violations, missing localized copy, and broken aspect-ratio adaptation without rendering PNGs.
   - Critic notes route back into `assembleStatic` as targeted edits to `Frame.tsx` and re-verify cleanly.
   - Request size stays `<= DRAFT_INPUT_CAP` (`65536`) even on 128-variant campaigns.
   - Historical blocks with `roles.critic.requests === 0` do not crash or throw `ROLE_ALLOWANCE_EXHAUSTED`.
3. Run `npm run typecheck`, `npm run lint`, and all relevant `node --import tsx --test` suites.
4. Write your complete review and migration report in `docs/reviews/2026-10-30-live-draft-critic.md`.
```
