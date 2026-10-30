# M00 local fixtures

`lamp.svg` is a hand-authored illustrative lamp, not a real product photograph.
`motion.mp4` is FFmpeg testsrc2 (320×180, H.264, 30 fps, 6 seconds).
`tone.wav` is a faded 440 Hz test tone (48 kHz mono PCM, 6 seconds).
These small signals intentionally test decoding/motion/audio, not creative quality.

`noto-*.woff2` are the Latin/Cyrillic Noto Sans 400 subsets from pinned
`@fontsource/noto-sans`; redistribution license is in `OFL.txt`.
All are local, non-secret fixtures. Regenerate with `npm run fixtures:generate`
(FFmpeg required); then review changed hashes in `fixtures/scene.json`.
FFmpeg version changes can change encoded bytes even for identical signals.
