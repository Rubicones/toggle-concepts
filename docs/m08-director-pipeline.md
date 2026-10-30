# M08 — Director pipeline: free creative agents, assembly in Remotion code (plan)

Status: proposed · Owner: Dmitry · Replaces the creative@1/creative@2 slot pipeline for new creative blocks (M07b–M07h). Old blocks stay readable.

## 1. Why

The draft became a slide show again ("logo on top, picture card in the middle, text below", hard crossfades, no camera) because every fix moved a decision from the model into code: key bookkeeping → enums, text overflow → code autofix, layout → a library of brand "compositions" and zones that a planner fills. The engine's frame language is general, but the agent never writes it — a zone planner does. That is a bottleneck and a template system, the same mistake as in toggle2.

Product rule: an ad is not a slide show. Creative decisions belong to agents with full creative freedom and the best possible tools; code owns only identity, facts, money and objective checks.

## 2. The pipeline (per direction)

1. **Director** (strong vision-capable text model). Input: the approved storyboard (scenes, timing, approved on-screen copy, visual and motion notes), the full brand kit (tokens, logos, fonts, rules, references with images), the brief (offer, CTA, legal, synthesis permissions, facts), supplied assets (with images), ordered variants (formats, locales, hooks, CTAs, lengths).
   Output:
   - a **design document** in free prose/markdown: per scene every layer, its role, look, scale, framing, typography, motion and camera over time, transitions, how each format adapts, how hooks/CTAs/lengths vary;
   - a **resource list** (the only strict part): id, kind (still · 3D still render; no video/3D for drafts), purpose, scene, prompt in plain language, aspect, references (asset ids), "must not contain".
2. **Resources**. Generate every requested still (existing priced, idempotent image path: plain-language prompts, no role instructions, exact cost read back, reconciled stills reused). Supplied assets are used as they are. The result is a resource catalog with thumbnails and dimensions.
3. **Assembler** (strong coding model, agent with tools, local worker). It writes one **parametric Remotion composition** for the direction (React/TSX) from the design document, the resource catalog and the brand kit module. Props: format, locale, hook, CTA, length. It decides adaptation per format itself (re-composition, not shrinking). Any React/CSS/SVG/canvas technique is allowed, plus: the Remotion packages (transitions, paths, shapes, noise, lottie, media-utils, layout-utils), **GSAP with all its plugins** (SplitText, MorphSVG, DrawSVG, MotionPath, CustomEase, Flip), and **Three.js through `@remotion/three`** (React Three Fiber; procedural 3D, extruded type, particles, product stills on 3D planes).
   **Determinism rule** (the only technical constraint): every frame is a pure function of `useCurrentFrame()` and props. The workspace provides `useGsapTimeline(build)` (a paused timeline seeked to `frame / fps` on every frame) and frame-driven Three helpers. Forbidden in compositions and enforced by a lint tool: `requestAnimationFrame`, timers, `Date`, `Math.random` (use Remotion `random(seed)`), CSS animations/transitions, R3F `useFrame` clocks, network fetches. A determinism check renders sampled frames twice and out of order and compares pixels.
   Tools, in a loop until checks pass or its budget ends:
   - write/read files in its own composition folder;
   - typecheck; bundle;
   - render a still (format, props, time) and a low-res preview video;
   - run objective checks (below) and read their results;
   - lint for the determinism rule; render sampled frames twice/out of order and compare;
   - list resources, read the brand kit.
4. **Critic** (vision model). Sees per format a filmstrip (e.g. 8 frames per scene) and the preview video frames, the storyboard and the design document. Judges aesthetics, storyboard fidelity, brand fit, motion quality. Returns notes addressed to the **director** (creative: idea, staging, rhythm) or the **assembler** (execution: spacing, timing, readability). Up to 2 rounds within the priced allowance; then the AD decides with both iterations side by side.
5. **Delivery**. The same composition renders every ordered variant. Draft MP4 of the reference variant plus contact strips; all variants renderable on demand.

## 3. What code owns (not design)

- Identity: run, round, direction, iteration, resource and file ids. Agents never invent or reconcile keys.
- Facts: approved copy and protected CTA/legal/offer, available as a typed module the composition must use (`copy.hook[locale]`, …); the checks verify they appear verbatim.
- Money: estimates shown first, caps, idempotent requests, receipts.
- Objective checks, run on renders (DOM boxes and text from the Remotion render, pixels from frames):
  - approved copy present verbatim for every variant;
  - text and logos outside platform safe zones (per placement profile);
  - legibility: contrast on actual pixels and minimum size per format;
  - the brand rules that are hard rules (logo clear space, forbidden colours, allowed fonts);
  - duration and scene timing vs. the storyboard;
  - no frame identical for longer than the storyboard allows (anti-slideshow), measured on renders.
  Checks report; they never move anything. Failures go back to the assembler as tool results.
- Sandbox: compositions run only inside the Remotion renderer (headless Chromium) on the local worker; no network except locally served resources and fonts; writes confined to the direction's folder; no Node APIs inside compositions; time and memory limits per render.

## 4. AD experience

- Per direction: iterations (director doc, resources, composition version, renders, critic notes, cost) — every iteration playable.
- Questions only for key decisions, in plain language with options and prices: approved copy cannot be made legible in a format; a resource the brief does not permit; budget exhausted; the critic and agents could not converge in 2 rounds.
- Changes: the AD writes notes ("scene 3: zoom into the comment, not the whole screen"), routed like critic notes. No field editor for layers.

## 5. Phases

- **P0 Remotion toolchain for agents** — a composition workspace per direction under the local worker, with Remotion packages, GSAP (all plugins) via `useGsapTimeline`, Three.js via `@remotion/three` with a GL backend that works headless on the studio Mac (`--gl=angle`), and the determinism lint/check; brand kit as a TS module (tokens, fonts via FontFace from kit files, logos, approved copy); render-still/preview/bundle/typecheck as callable tools; the objective checks on renders; sandbox limits. Prove it with a hand-written Sonicdesk composition fixture (full-bleed montage with camera moves, a SplitText kinetic hook, a UI macro zoom to the comment bubble, one Three.js element, end card with CTA press) rendering all four formats and passing checks.
- **P1 Director** — prompt (instructions emphasise creative freedom, the storyboard as the spine, brand as a system not a template, designing each format) and output contract (free design doc + strict resource list). Priced; recorded fixtures.
- **P2 Resources** — reuse the existing still path for the director's list; catalog with thumbnails for the assembler and critic.
- **P3 Assembler agent loop** — tool-using agent on the local worker with a token/time budget, iteration snapshots of its folder, failure modes (typecheck/render errors fixed by itself; persistent failure → AD question).
- **P4 Critic** — filmstrip/preview inputs, routed notes, 2 rounds, AD escalation.
- **P5 Variants & delivery** — parametric renders of all ordered variants, reference MP4, contact strips, delivery records.
- **P6 AD UI** — iterations, player (rendered previews), plain-language questions, notes.
- **P7 Retirement** — new blocks use `director@1`; creative@1/2, compositions/zones planner, normalizers and slot fill are kept only to read old blocks.

Each phase: typecheck, lint, npm test, next build; recorded fixtures only (no live provider calls in tests); migrations added, Dmitry applies them; do not verify visually — Dmitry reviews renders.

## 6. Implementation prompt (for Codex)

> Implement M08 from `docs/m08-director-pipeline.md`, phases P0–P7 in order, one commit per phase ("M08 P<n>: …"), do not push.
>
> Product rule: an ad is not a slide show. Every creative decision belongs to agents with full creative freedom: the director designs every layer, motion, camera, transition and format adaptation in a free design document; the assembler is a tool-using coding agent that implements it as one parametric Remotion composition (React/TSX, any Remotion package or web technique); a vision critic judges the rendered result and routes notes back. Code owns only identity, approved copy/facts, money and objective checks on renders. Do not introduce compositions, zones, slot enums, layout planners or code that moves elements — that is the bottleneck this milestone removes.
>
> Start with P0 and prove the toolchain with a hand-written Sonicdesk composition fixture that renders all four formats and passes the checks; agents come after the toolchain works. Run agent-written code only inside the Remotion renderer on the local worker with the sandbox limits in §3.
>
> Paid calls: priced and shown before any request, within caps, idempotent; tests and verification use recorded fixtures only. After each phase: typecheck, lint, npm test, next build. Do not verify visually. Final report: per phase what changed, verification, sandbox limits, and the P0 fixture's check results per format.
