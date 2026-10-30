# M09 — Static drafts and a visible pipeline (plan)

Status: implemented (S1–S7; see `docs/verification/m09.md` and `docs/m09/sonicdesk-static-results.json`) · Owner: Dmitry · Builds on M08 (`director@1`). The motion pipeline stays for a later stage; drafts become static.

## 1. Why

The first live director@1 run (Sonicdesk, one direction, Claude Sonnet for all three roles) showed that building a full motion film for a draft is too slow and too expensive, and that the AD cannot see what the engine is doing:

- The coding agent's turns cost ~150k input tokens each; 9 requests used the whole 1.5M-token allowance without writing `Composition.tsx`.
- It spent turns paging through generated files (a 207 KB `brand.ts` holding every variant's copy) instead of writing.
- One streamed answer ran for 10+ minutes with no visible progress; the UI showed nothing between saves.
- Every render with checks takes about a minute per format, and the critic needs renders of all formats.
- The AD saw only a stop reason, never the intermediate work.

## 2. Product decisions

1. **A draft is a set of static, final-looking frames, not a film.** For every scene the agents decide the key frame(s): real layout, typography, brand graphics, pictures, and adaptation per format. The AD switches format, locale, hook, CTA and length and sees the matching frames. Drafts are not playable: there is no animation code, no timeline, no transitions and no video render.
2. **No video or 3D generation in drafts.** Where the final will use video or 3D, the director requests a **low-resolution still proxy** through the existing image path, at the cheapest image setting. The proxy is labelled as a proxy everywhere it appears. Three.js is not used in drafts.
3. **Motion is designed but not built yet.** The director's design document still describes motion, camera and transitions per scene. That intent is used later by a separate motion stage after the AD approves the static draft. The M08 motion tooling (GSAP via `useGsapTimeline`, `@remotion/three`, determinism checks, video renders) is kept for that stage and is not used for drafts.
4. **The AD sees every step the engine takes,** with an approximate result wherever one exists. Nothing is hidden behind a spinner, and every intermediate artifact stays viewable.

## 3. Static draft pipeline (per direction)

1. **Director.** Same inputs as M08. Output:
   - the design document: per scene, key frame(s), every layer, its look and adaptation per format, plus the motion intent for later;
   - the resource list. Video and 3D needs become `proxy: true` stills at low resolution.

   The design document is limited to what a coder needs; it is not an essay.
2. **Resources.** The existing priced and idempotent still path. Proxies use the cheapest resolution. Each picture appears in the AD timeline as soon as it exists.
3. **Layout coder.** It writes one parametric static composition `Frame.tsx` with props `{format, locale, hook, cta, length, sceneId, moment}`. It must be a pure layout of that moment: no animation APIs, no `useCurrentFrame`-driven change, no GSAP and no Three.js. It is rendered with `renderStill`.

   Tools: `write`, `read`, `typecheck`, `bundle`, `renderStill(variantId, sceneId, moment)`, `checks`, `listResources`, `finish`. The prompt carries the brand-module API guide (already in `packages/director/transcript.ts`), never the raw data files.
4. **Checks on stills.** Each check reports and never moves anything:
   - approved copy is present verbatim for the variant and scene;
   - text and logos sit inside the safe areas;
   - text is legible: contrast on the real pixels and the minimum text size;
   - the brand's hard rules hold: allowed fonts, forbidden colours, logo clear space.

   Timing, anti-slideshow and determinism checks do not apply to drafts.
5. **Critic** (vision) sees a grid of key frames per format plus the design document. It judges layout, hierarchy, brand fit, storyboard fidelity and format adaptation, and routes notes to the director or the coder. Up to 2 rounds.
6. **Draft viewer.** A storyboard grid of scenes × moments for the selected variant, with switchers for format, locale, hook, CTA and length.
   - The reference variant's frames are rendered when the draft finishes.
   - Any other variant's frames are rendered on demand, free (local), and cached.
   - Contact sheet download.
   - No video player for drafts.
7. **Budget targets** with Sonnet-class models, for one direction:
   - about $1.5–2.5 in total;
   - about 10 minutes or less from approval to the first frames.

   Size the allowances so the coder normally finishes in 6–12 turns. Show the price before any paid request, as today.

## 3a. Cost controls (implemented)

- Cache the stable instructions and compact campaign prefix; keep changing tool observations after the cache boundary. Count settled input allowances in billed token equivalents using frozen read/write prices; keep full conservative reservations for open receipts.
- Give the director reference-variant copy, compact variant axes, source summaries and at most six capped JPEGs. Allow two design attempts. Keep all approved variants in the generated brand module for the coder.
- Ask the coder to write `Frame.tsx` in one request. The app builds, renders and checks it; allow at most two direct repairs, then a bounded tool fallback. Repairs and revisions receive existing authored source, and larger revisions can read their own files through tools.
- Bound each draft request at 32,768 conservative input tokens. Deterministically compact source history and older tool output, omit excess reference images if necessary, and record compaction. Reject required material that still exceeds the cap before reserving or sending a paid request.

The normal coder path can finish in one request; its fallback allowance is nine requests. Generated brand/input files cannot be paged through, including path aliases. The streaming idle timeout and the M08 financial and provider protections remain in force. See `docs/verification/m09.md` for fixture bounds and the distinction between replay reservations and provider billing.

## 4. The AD sees every step

- **Per-direction timeline** of append-only step events, stored in a table (e.g. `studio_director_events`) rather than in the mutable work state:
  - Director: started; design document ready (readable).
  - Each picture requested and ready (thumbnail, prompt, proxy flag, cost).
  - Each coder turn: files written (names and sizes), tools run, and their results in plain words.
  - Every successful `renderStill`, shown as an **approximate result**: the still image, labelled "work in progress, not checked".
  - Each checks run with findings per format.
  - The critic's notes.
  - Delivery.
- **Each step shows** status (queued, running, done, failed), start and end time, cost, and the agent's model.
- **While a request is open,** the timeline shows "the coder is writing its answer since 14:32". Long requests are normal and must never look like a hang.
- **Live updates** through the existing studio event stream, or polling, with no manual refresh.
- **AD actions on a running direction:**
  - "Wrap up and show what exists": free; renders the frames the code can already render, labelled unchecked.
  - Notes to the director or the coder.
  - "Continue with more allowance": one priced continuation.
  - Stop.
- **Plain language** in every message. Codes and paths go only under Technical details.

## 5. Keep (already in the code after M08 hardening — do not revert)

- **Creative-role models and briefs.** The three creative roles use the current Settings models and director@1 role briefs, applied at approval through `studio_run_agent_overrides`.
- **Provider requests:**
  - provider-portable JSON schemas (`packages/director/provider-schema.ts`);
  - the flat coder call schema with a lenient per-call reader (`parseAssemblerReply`);
  - retries that only move forward, plus free provider rejections (migration 046);
  - an idle timeout for streamed answers instead of a hard 10-minute cut.
- **Coder context:**
  - transcript compaction;
  - the compact coder context with the brand-module guide;
  - generated files are not paged through by `read`.
- **AD controls:**
  - "Continue with more allowance" (migration 047);
  - "Wrap up and show the draft" (migration 048);
  - the activity log;
  - the "Start new draft run" button with the direction count;
  - plain-language stop reasons.

## 6. Phases

- **S1 Step events and timeline UI.** Events table and writer API. Emit events from every existing step (director, resources, coder turns, renders, checks, critic, delivery). Timeline component with live updates and approximate stills from `renderStill`.
- **S2 Static draft contract.** Director output with key frames per scene and proxy stills for video and 3D (low resolution), plus a prompt update. Recorded fixtures.
- **S3 Static layout coder.**
  - `Frame.tsx` workspace, tools and checks on stills.
  - A policy lint that rejects animation APIs, GSAP and Three in draft code.
  - Allowances sized for 6–12 turns.
  - A recorded-fixture loop test: it writes `Frame.tsx` on the first turn and finishes within budget.
- **S4 Draft viewer.** Grid of scenes × moments, variant switchers, on-demand cached stills, contact sheet.
- **S5 Critic on stills.** Routed notes, AD notes that start a revision from the same code (the director is reused when only coder notes exist).
- **S6 Money and stages.**
  - New estimates and quotes.
  - Drafts use the static path.
  - The M08 motion path is kept behind a later "motion" stage, not admitted for drafts.
  - Existing director@1 blocks stay readable.
- **S7 Verification.**
  - A Sonicdesk static-draft fixture renders all four formats and passes the still checks.
  - The token per-turn bound is tested.
  - No AD-facing message contains an engine path.

Each phase:
- one commit ("M09 S<n>: …"), no push;
- typecheck, lint, `npm test` and `next build`;
- recorded fixtures only, no live provider calls;
- migrations are added and Dmitry applies them;
- no visual verification.

## 7. Implementation prompt (for Codex)

> Implement M09 from `docs/m09-static-drafts.md`, phases S1–S7 in order, one commit per phase ("M09 S<n>: …"), do not push.
>
> **Product rules.** Drafts are static, final-looking key frames per scene that the AD can switch across format, locale, hook, CTA and length. They are not playable: no animation code, no video renders, no Three.js, and no video or 3D generation. Video and 3D needs become low-resolution still proxies through the existing image path, labelled as proxies. The director still designs motion in the design document for a later motion stage; keep the M08 motion tooling for that stage but do not use it for drafts. Creative decisions stay with the agents: no templates, zones, layout planners, or code that moves elements.
>
> **The AD sees every step.** Store append-only step events and show a live per-direction timeline:
> - every request with its status, time, model and cost;
> - every picture as it arrives;
> - every coder turn: files written and tool results in plain words;
> - every successful `renderStill` as an approximate "work in progress, not checked" image;
> - checks and critic notes.
>
> An open model request must show "writing its answer since …". The AD can wrap up and see what exists, send notes, continue with one priced allowance, or stop.
>
> **Cost and time.** Target about $1.5–2.5 and about 10 minutes per direction with Sonnet-class models; size allowances so the coder finishes in 6–12 turns. The live run behind this milestone used 1.5M input tokens in 9 coder requests without writing a file: the agent paged through a 207 KB generated `brand.ts`, and one streamed answer ran over 10 minutes with no visible progress. Prevent each of these:
> - keep the compact coder context and the brand-module guide;
> - instruct the coder to write `Frame.tsx` first;
> - keep tool results small;
> - keep the idle-timeout streaming.
>
> Do not revert the M08 hardening listed in §5.
>
> **Verification.** Paid calls are priced and shown before any request, stay within caps and are idempotent; tests use recorded fixtures only. After each phase run typecheck, lint, `npm test` and `next build`. Add migrations; Dmitry applies them. Do not verify visually.
>
> **Final report:** per phase, what changed and how it was verified; the Sonicdesk static fixture's check results per format; the measured tokens per coder turn on the recorded fixture.
