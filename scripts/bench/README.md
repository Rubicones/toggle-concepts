# Draft bench

A manual, live test of the designer on invented brands. It runs the production designer loop
(`runDesigner`, the real instructions, response schema, build, render and measurement) against the
Claude Code CLI you are signed in to, with no database. It is never part of `npm test`.

Every run spends the signed-in Claude subscription: about 8–11 minutes and $1.5–3 API-equivalent
per brand.

## Run

```bash
node --import tsx scripts/bench/pipeline-bench.ts <brand> --turns=18 --pictures=4
```

Brands: see `brands.ts` (`pallet`, `mossa`, `dvor`, `tono`, `fold`, `kiln`, `lumo`, `halden`,
`vantro`, `corvia`). They are invented; none is a real company.

Options: `--pictures=N` (how many pictures the designer may ask for, 0 = code only),
`--reviews=2` (hero critic rounds), `--endreview=1` (end review with one repair round),
`--propose=1` (no client words: hooks and visuals are proposed together first),
`--model=`, `--effort=`, `--wait=900` (seconds to wait for a picture).

Results land in `artifacts/bench/<brand>-pipeline-…/` (ignored by git): `summary.json`
(time, tokens, API-equivalent), `turn-N.json`, the reviews, and `sweep/` with every scene in
every format, language and hook.

```bash
python3 scripts/bench/sheet.py artifacts/bench/<run folder> en-GB primary   # contact sheet
node --import tsx scripts/bench/sweep.ts <brand> artifacts/bench/<run folder> # re-render, no model call
```

## What the machine needs

- Claude Code CLI signed in (`claude` on PATH).
- A headless Chromium for rendering. If Remotion's own download is missing, point to one:
  `export DIRECTOR_CHROME_PATH=/path/to/chrome-headless-shell`.
- The brand fonts in `brands.ts` are read from Linux system font paths
  (`/usr/share/fonts/...`: Inter, JetBrains Mono, Caladea, Carlito, Liberation, DejaVu). On
  another system install those fonts or change the `source` paths; a missing file stops the run
  with the path in the error.
- Python 3 with Pillow for `sheet.py` and `requests.py`.

## Pictures

The bench cannot buy pictures. When the designer asks for one, the request is written to
`<run>/pictures/<id>.request.json` and the run waits (`--wait`) for `<id>.jpg` or `<id>.png`
(and `<id>.cutout.png` for a cutout) to appear next to it. Make the picture with any image
tool from the request's prompt and drop it there; `requests.py list` prints the open requests
of the latest runs and `requests.py place <index> <url> [cutout url]` downloads and places one.
With `--pictures=0` the designer works in code only.
