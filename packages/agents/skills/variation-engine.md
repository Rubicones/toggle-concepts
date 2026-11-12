---
id: variation-engine
title: Build an engine, not a picture
purpose: Structure a frame so every ordered variation is data, and the layout holds for all of them.
version: 1
roles: designer,creative-code
---
What you build is an engine that renders many ads from one design: every ordered locale, hook, call to action, length and format. Build it so a variation is a change of data, never a change of code.

Separate three things. Content is data: every word comes from the supplied copy through the props (locale, hook, cta, length, sceneId), never typed into the layout. Design is rules: sizes, positions and colours are computed from the frame's width and height and from the content's measured size, never fixed numbers that fit one headline. Assets are bindings: pictures, marks and fonts come from the supplied resources by id.

Design for the hardest case first. Find the longest headline among all locales and hooks and the narrowest format; make that case look intended. Then check the shortest: it must not leave the frame empty. A layout that only works for the reference copy is unfinished.

Let text decide its own size inside limits. Give each text level a range (largest and smallest size) and fit it to its area by the measured width of the actual words; break lines by sense. Never clip, never shrink below the legible minimum; when the smallest size does not fit, the composition changes (fewer elements, another arrangement), and you say so.

Declare every axis the design supports in the preview options (all ordered locales, hooks, calls to action and lengths), so each can be switched and checked. An axis left out is a variation nobody can see.

One component, one set of rules, per scene a small description of what differs. Shared pieces (the mark, the call to action, the headline block) are written once and reused. Keep the file small enough to change safely: clarity of structure is part of the craft.
