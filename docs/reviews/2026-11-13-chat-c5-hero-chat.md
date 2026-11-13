# Work Review: C5 — The hero frame as a chat (designerVersion 4, stage H)

- **Date:** 2026-11-13
- **Branch:** `claude/cool-goodall-qboh37` (local `work`), not committed
- **Base Commit:** `a3991f3`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** stage H uses the existing work state, ledger, allowances, critic requests and stage-effort table (the new stage `design-hero` fits its existing check).
- **How to Apply:** nothing to run. Update the app and the runner (`Install-Toggle.cmd`).
- **Backward Compatibility:** new designer quotes in shared Local runs carry `designerVersion: 4` (with C3's and C4's flags); every other designer quote stays version 3. Blocks quoted before, versions 1–3 and frozen runs keep their exact requests (tested; one source-text test of the quote was updated to the new line).

**Owner's approval gate (added at commit):** new designer blocks of shared Local runs quote `designerVersion: 3` with the C3/C4 flags until the owner approves the stage H instruction below. Version 4 is opt-in on the computer that runs the app with `STUDIO_HERO_CHAT=1`; after approval this becomes the default (one line in `lib/server/director-start.ts`).

## 2. Summary of Changes

**First, the open question from C4 (owner's answer).** In version 4 blocks with a compact sheet, the full brand sheet pages are not sent at all: neither in the first turn nor later. They are catalogue entries (`sheet-<section>[-<part>]`) the designer asks for by name; the hero critic of stage H does not receive them either (it reads the pack and the digest). `apps/local-runner/director/assets.ts` (`sheetEntries`), `worker.ts`.

**5a–5c, 5e, 5h: the hero conversation.**
- `packages/director/hero-chat.ts` (new): `heroChat` (designerVersion ≥ 4, engine kit); `parseHeroAnswer` (prose; whole files in fenced blocks with a path in the info string, on the line before, or an unnamed first tsx block as `Frame.tsx`; paths outside the draft are refused; one `actions` block of JSON: `render`, `review`, `pictures` (purpose, prompt, aspect, references by file name, cutout, proxy), `materials`); `actionsCorrection` (one line; the answer's files are applied, never a lost turn); `heroTask` (the first message: the hero scene by name, its approved words, what the code can use: `Frame.tsx` with `width`/`height`, `./brand`, fonts by family, optional `./kit`); `renderNote`; `stageEOpening`.
- `apps/local-runner/director/hero-chat-loop.ts` (new): `runHeroChat`. One conversation (the designer's own, branched from the planning point, C1). Every building change is rendered in the reference format and answered with the screenshot and a short note: what must be fixed, what was measured as observations, pictures asked for and arrived, materials. A turn without files or actions is told so. Stage H uses at most half of the designer's approved requests; if they run out with a rendered frame, it leads the other scenes. Then `runDesigner` continues stage E in the same conversation: its first request opens with the scene names → ids the code uses and the version 3 mechanics, sent once (`stageEOpening`, `state.stageEOpened`).
- `packages/director/designer-digest.ts`: in stage H the digest names scenes only ("Scene 1"); ids arrive with stage E. This does not touch saved previews: the runtime still passes the real scene ids; the stage H frame draws one scene and needs none.
- `worker.ts`: stage H requests are plain answers (no JSON schema: `call(..., null, ...)`), with the stage H instruction as the role text and the digest as plain text; effort from the new stage `design-hero` (high by default, Models & agents) in `packages/agents/stage-effort.ts`.
- 5e: full means are in the instruction (any CSS, pictures, cutouts, rendered 3D stills); the kit is optional. Three.js in drafts is C8.

**5d: stage H findings.** `stageHFindings`: hard only for missing approved words, a render error, the logo missing or unreadable, text not in a brand font; overlap, contrast, safe area, size and broken words are observations the designer weighs. The full hard set returns in stage E (unchanged mechanics).

**5g: hero gate.** The hero review is a separate critic request (no designer history, no session), with the brand pack in its prefix and `heroReviewContext` (the digest without ids and what was measured) as plain text, judged by `HERO_CRITIC_INSTRUCTIONS`: stopping power, idea, craft, then the hard findings. Its notes come back as the next message in the designer's conversation; review counts as today; the run does not stop.

**5j: UI.** `components/studio/director-timeline.tsx`: a stage H turn reads as the designer's idea in its own words (the timeline line), with "The designer's idea, in its own words" expandable, each render as before (thumbnail), the reviewer's notes as before; the raw files and actions block only under "Technical details: files and actions".

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests.** Gated by `designerVersion 4` in new quotes; nothing changes for versions 1–3 or existing blocks. Stage H requests have new identities (plain prompt, no schema) only in version 4 blocks.
2. **Size limits.** No schema touched in stage H (it has none); stage E keeps `designer_turn_v3_materials`. The stage H instruction is ~770 tokens (3,087 characters); the hero critic instruction ~235 tokens. The first turn no longer carries the full brand sheet (−15k tokens for a 10-slice sheet): compact sheet + digest + instruction.
3. **`AGENTS.md` principles.** The instruction is aesthetic-first, names no brand, font, design system, template or look, and asks the agent to invent its own language; approved words stay verbatim and the hard findings protect them, the logo and the brand fonts. Pictures and materials stay inside their approved counts and budgets; no paid calls in tests.
4. **Risks.** A chat answer can put code outside a fence or forget the path: the first tsx block is taken as `Frame.tsx`, anything else stays prose and the app says no files arrived. Version 4 becomes what shared Local designer quotes use now; C10 decides whether it stays.

## Stage H instruction — for the owner's approval

> You are the designer of one advertising direction. Right now you make one frame: the hero frame, the moment that proves the promise. Make it the way you would in a conversation with an art director: think, decide, draw, look, refine.
>
> What matters, in this order:
> 1. It stops the scroll. In the first half second a viewer on a busy feed sees something they did not expect and wants to look closer. A frame that is merely tidy has failed.
> 2. It carries one idea. One clear visual thought that makes the line true, specific to this product and this brand. If the frame would still work after swapping the logo for another one, the idea is not there yet.
> 3. It belongs to this brand. Read the brand character, the compact sheet and the rules as a character, not a checklist: its temperament, its signature, its proportions of colour, how it speaks. Build with them; never imitate their layout.
> 4. It is crafted. Type set with intent: scale, weight, rhythm and contrast that make the words land in order. A composition with a real hierarchy and a real focal point. Space used on purpose. Pictures that look made, not found.
>
> Invent your own visual language for this direction. Do not reach for a familiar arrangement because it is safe; ask what only this idea could look like, then commit to it. Large, cropped, overlapping or unusual can be right when the idea asks for it; say so, and keep the approved words readable.
>
> Choose the way of making on purpose. Every means is open: a photograph, a rendered 3D object or scene, graphics and type built in code, an interface built in code or shown on a device, an infographic made from the product's real figures, gradients and light as surfaces, a collage of cutouts and type, or a mix. Pick it from the idea and the brand's character, never because it is the easiest to build. A physical subject — the product, people, hands, places, materials — is usually a photograph or a rendered object you ask for as a picture: brief it as a precise shot (situation, composition, subject position, camera, light, ground, materials, colour, what is absent), never with adjectives, and never with words, numbers, interfaces or logos inside it. Interfaces, data and diagrams are built in code from the brand's own components and the product's real structure. The product, the logo and the brand's marks are used as supplied, never redrawn.
>
> The words are the approved ones, exactly, and nothing else is written except text that belongs inside a depicted product or interface.
>
> Work like this. Write your thinking first: the idea, why it is right for this brand and this line, the way of making, and what makes it stop the scroll. Then the complete files. You will see each render with what was measured. Look at it as a viewer would: what is read first, second and third, and what is weakest. Change what serves the idea; a measured observation that your idea deliberately breaks can stay when you say why. When the frame is the best you can make it, ask for its review; the reviewer's notes come back to you, and you decide how to answer them in the work.

The hero review's instruction (also new):

> You review one hero frame of an advertising direction: the frame every other scene will follow. You see it rendered, with the direction in short and what was measured. Judge in this order: does it stop the scroll in the first half second; is there one clear idea that makes the line true and could only belong to this brand and product; is it crafted (type, hierarchy, focal point, space, picture quality, the brand's character); then the measured problems that must be fixed (approved words missing, a render error, the logo missing or unreadable, text not in a brand font). Accept the frame when it is strong and nothing must be fixed. Otherwise give at most five notes, most important first, each naming what you see and what it should achieve; never prescribe a layout, a style or an example, and never ask to make it safer or more conventional. Write notes for the designer (recipient director). Answer only in the requested format.

## 4. Verification Results

- `npm run typecheck`: passed. `npm run lint`: passed. `npx next build`: exit 0.
- `node --import tsx --test tests/chat-c*.test.ts tests/designer-*.test.ts tests/local-claude-*.test.ts tests/hero-frame.test.ts tests/agent-output.test.ts`: 215 pass, 0 fail (4 new C5 tests: parsing of prose, files and actions with a malformed block; stage H severity; gating, instruction size and content, scene names, the critic context without designer history, effort; a recorded four-turn hero conversation with a render note, a picture by file name, a correction, a review with notes and acceptance). The critic request never joins the designer's conversation (LC3 test, unchanged).
- `tests/director-*.test.ts tests/local-*.test.ts tests/brand*.test.ts tests/brief-feel*.test.ts`: 396 pass, 1 fail ("AD browser flow", fails the same way on the base).
- Not measured on a live run or the bench (the plan's "done when" needs the owner's blind A/B on the bench).
