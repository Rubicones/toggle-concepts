# Toggle2 engine core

The engine, layout compiler, planner, glyph shaper, UI drawing and Canvas display-list renderer are ported from `toggle2/lib/ad` for M07b option A. Only their pure dependency closure is included. Storage, agents, kit persistence, browser encoders and database code are excluded.

`adapter.ts` is the boundary from frozen BrandSystem to the legacy Kit internals. Both preview and local Chromium rendering use `remotion/EngineComposition.tsx` and the same display list. HarfBuzz shapes and draws actual font-file glyphs; there is no browser font substitution.

Historical M07 uses its existing composition. Authored component code remains disabled until M07c.
