# Toggle Concepts — product and creative context

Updated: 30 October 2026. Background for anyone working on this repository, people or AI agents of any vendor. Engineering rules, approvals and the studio's architecture live in `AGENTS.md` and `docs/`; where they differ from anything here, `AGENTS.md` wins.

Section 3 describes a separate piece of work — the KITE ad engine built for our landing pages. It is a **reference for creative judgment and for the founder's taste**, not a pattern to copy into this application. In particular, its per-format geometry tables are the kind of preset layout code `AGENTS.md` forbids in the studio: in the studio, agents author the responsive layout themselves.

## 1. What the product does

- Toggle Concepts is a product of the motion studio Toggle (toggle.studio): an external creative department for brands and agencies.
- People own the idea, branding and art direction; the engine builds every version of a concept (formats, sizes, languages, hooks, CTAs, lengths). Every delivered file is checked by people.
- Main use: content for direct-response ads, especially performance testing, where teams need many creatives all the time. Also social content, app-store screenshots, banners, CRM and in-app, localization; static and motion.
- The unit of work is a **concept**: one idea with art direction plus all its versions.
- The point of the product: high-volume testing without losing the brand. Every version must still look like the brand and be considered, well-crafted work.

## 2. Voice and visual identity of Toggle Concepts

**Voice.** Calm, clear, human; a story, not a sale. Avoid "AI-powered", "generate", "unlimited". The central word is *concept*; *engine* is for process and demos. Lines in use: "Concepts by people. Every version at scale." · "One concept. Every format, language and market." · "Scale your content, not your team."

**Design system of our landings and studio UI.**

- Font: Inter Tight. Logo: the TOGGLE wordmark SVG (+ "Concepts").
- Colors: navy/ink `#0C2B3F`, muted `#5A6B78`, sky `#B4E4FA`, grey `#F1F1F1`, line `#DDE3E8`, white; accent orange `#FF4F17`.
- Gradients: hero `#B9E7FA → #86AFC4 → #3A5B71 → #0C2B3F`; light `#F3FBFF → #B4E4FA`.
- Bento layout of rounded tiles (radius 32px), pill buttons and chips, light page.
- Signature element: a glossy orange 3D ring. Always upright — never rotated or tilted.

## 3. Reference: the KITE ad engine (landing demo)

**What it is.** A drop-in web component `<kite-engine>` for concepts.toggle.studio that shows one concept for a demo brand, **KITE** (a cashback card), in five styles. Each style is its own engine with its own switches; all share Language (EN, ES, FR, DE, TR) and Format (9:16, 4:5, 1:1, 16:9). 1,600 variations per style, 8,000 in total. The styles were copied from the founder's reference videos `KITE_GOOD*.mp4`.

### 3.1 Styles and what defines each

| Style | Reference | Switches | Signature |
|---|---|---|---|
| Lifestyle | KITE_GOOD, KITE_GOOD 2_3 | Layout (Field on top / Field below / Split / Type only), Hook, Scene | Live scene video + orange field; cream highlight boxes; typed "KITE does"; every hook has a subhead; end card with store badges |
| Studio | KITE_GOOD_3 | Still life, Hook, CTA | Dark studio still life (looped light video) on near-black, orange field below |
| 3D object | KITE_GOOD_5 | Object (milk, eggs, bread, can), Hook, Motion (Float, Spin, Glide, Tumble) | Real 3D model sitting on the brand's stepped split; the split shape never changes |
| Knit | KITE_GOOD_6 | Embroidery (cup, tram, basket, milk), Hook, Type position | Stop-motion embroidery at 6 fps, frames from the founder's stabilized shoot |
| App screen | KITE_GOOD_4, 4_2 | Hook, Spending, Screen (month / today / year / goal) | Flat phone on the dark grey gradient, counting cashback, rows appearing; variations live on the screen |

### 3.2 Technical decisions

- **Real design size.** Each ad is laid out at its true pixel size (1080 wide, 1920 for 16:9) and scaled with one `transform: scale()`, so layout is identical on desktop and phone. Margins 108px; logo and type sizes measured from the references. Text that is too long shrinks to fit its column (`fitText`), never overflows.
- **Shadow DOM, one script.** Styles are isolated; media load lazily per style and only while visible; videos and frames are pooled so switching options never reloads them.
- **3D in any sandbox.** three.js and the four GLB models ship as one classic `<script>` (`kite-3d.js`, models base64-inlined) — module `import()` and `fetch` fail under sandboxed/null origins. Orthographic camera in design pixels, studio environment lighting; the can is brushed aluminium. Without WebGL, pre-rendered PNGs of the same objects ride the split and the split still animates.
- **Knit without seams.** Separate frame sets per aspect ratio generated natively (outpainting left visible seams and mismatched knit). The loop starts only after every frame is decoded; all embroideries of the current format are preloaded in idle time.
- **Stable component.** The control panel takes the height of the tallest style, so switching styles never resizes the block; the preview frame snaps to whole pixels and takes the ad's background colour, so no white edge flashes during format changes.
- **Smooth edges.** No CSS 3D perspective on the phone (Chrome leaves jagged edges); the phone is flat.
- **QA that was run.** Every one of the 8,000 combinations checked for text leaving the frame; desktop and mobile layouts; 3D inside a sandboxed null-origin iframe with and without WebGL.

### 3.3 Creative decisions and the founder's feedback

These came from review rounds and show what "on brand" and "well made" mean to him:

- **Copy the reference exactly** where a brand device exists: the rounded tab (16px outer corners, about 50px tall, same height in every style), the stepped split with one raised tab in 3D object (field top at ~42% of height, tab from ~60% of width to 55px off the right edge), the low narrow tab on the Lifestyle split column.
- **Transitions as in the references:** on a structural change the orange field covers the frame and settles into place, then the tab slides out from behind it. Language changes swap text only.
- **Every element in motion**, but calm and premium: floating, slow spin, gliding. Cartoonish motion (bounce, squash) was rejected as off-brand.
- **No visible crops, seams, shakes or gaps:** a tiny push-in on a video read as camera shake and was removed; edges of video plates are feathered into the background; tabs overlap their field so no hairline gap shows.
- **Backgrounds stay in the brand palette.** A blurred live-photo background and a pastel gradient were rejected; a dark studio gradient was kept.
- **Readable hierarchy:** headline, subhead, CTA. A layout that hid the lifestyle footage or made text small in 9:16 was rebuilt.
- **Minimal over busy** in brand assets: LinkedIn covers were reduced to background + ring + at most name and one line.

### 3.4 Where it lives

`TREATMENTS/POCKET_PITCH/kite-engine.zip` on the founder's Yandex Disk (module, media, demo page, README in Russian); a live demo exists as a private Claude artifact.
