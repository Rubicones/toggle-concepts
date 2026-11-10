# Local mode runbook: test runs on your own Claude subscription

Local mode runs the **text agents** (planning, brand reading, designer, director, coder, critic) through the official Claude Code CLI on your own computer, with your own Claude subscription. Flash text roles run on Sonnet.

**Pictures and other generation stay paid through OpenRouter**, exactly as in normal runs.

Local results are test results: they cannot be accepted at C2 or delivered to a client.

Plan: `docs/plans/2026-11-06-local-claude-pipeline-plan.md`. Reviews: `docs/reviews/2026-11-06-local-claude-s*.md`.

## Windows computer (the owner): the studio inside WSL, on par with the Mac

On Windows the studio runs in a light background Ubuntu (WSL). There, agent code gets the same OS sandbox as on macOS (bubblewrap), so the whole pipeline works, draft films included.

Ubuntu is capped in `%USERPROFILE%\.wslconfig`: at most a third of the memory (up to 6 GB) and half the cores. It stops one minute after the studio closes.

**Install:** download the one file `scripts/windows/Install-Toggle.cmd` (on GitHub: *Download raw file*). If you have the developer's settings file, put it at `C:\toggle\.env.local`. Then double-click `Install-Toggle.cmd`; nothing needs to be typed. It keeps a copy of itself in `C:\toggle`.

- The first WSL install turns on Windows' virtualization feature, which needs one restart. Setup continues by itself after sign-in, through a RunOnce entry.
- No Ubuntu user is created: `--no-launch`, and the studio runs as Ubuntu's root.
- The GitHub and Claude sign-ins open in the browser.
- The code lives in Ubuntu at `/root/toggle/toggle-concepts`, not on Yandex Disk.
- A "Toggle Studio" desktop icon starts the studio. Running `Install-Toggle.cmd` again updates it.

## 0. Once, by whoever applies shared migrations (Dmitry)

Apply `supabase/migrations/20261106000100_local_text_execution.sql`, either with `npm run data:deploy` or by running the file in the Supabase SQL Editor.

It is safe to run twice. Old runs and other people's computers are unaffected.

## 1. Once per computer (the developer, on the studio Mac)

```bash
git fetch origin feat/local-claude-s3 && git checkout feat/local-claude-s3 && npm ci
```

```bash
npm run local-claude:doctor -- --fix
```

The doctor does three things:
- installs Claude Code if it is missing;
- opens the Claude sign-in in your browser (choose your **subscription** account, not an API key);
- creates this computer's id in `~/.toggle/device.json`.

It never reads or copies your token.

Next, turn **off** paid extra usage in your Claude account settings, then run:

```bash
npm run local-claude:doctor -- --fix --extra-usage-off
```

This is the capability check. It makes about ten short requests on your subscription and saves `~/.toggle/local-claude/profile.json`. The file holds the CLI version, the pinned Sonnet model, the isolation flags, each check's evidence and the verdict. It contains no tokens.

If the verdict says "blocked", the reason is printed; send the file.

Repeat the check after updating Claude Code. The runner refuses Local work on a CLI version that was not checked (`LOCAL_CLI_CHANGED`).

## 2. Switch this computer to Local

1. Start the studio as usual (for example `npm run dev:shared`).
2. Open **Settings → Text agents: Local / OpenRouter** and choose **Use Local (Claude subscription)**.

The switch belongs to this computer only and applies to **new** runs and brand analyses; runs already started keep their mode. Other people's computers stay on OpenRouter.

## 3. The first live Local run (S5)

1. Use one small case and one direction: a short brief and the usual brand materials.
2. Go through the normal path: brand inputs → C1 → planning → A1 → designer/director → checks → critic → repairs.
3. Pictures are bought through OpenRouter within the approved budget, as usual.

If the subscription limit is reached, the work **waits**, and that is not a failure. The job shows "waiting for the Claude subscription limit". The active-time clocks pause, and work resumes by itself; the computer checks again every 15 minutes.

When the run finishes, or stops, run:

```bash
npm run local-claude:report -- <runId>
```

The report lands in `artifacts/local-claude-report-<runId>.md` and keeps three quantities apart:
1. **Actual OpenRouter spending:** pictures.
2. **Observed Claude use:** requests, tokens, internal schema attempts, active time and limit stops.
3. **The forecast of what the text would have cost on the target models.** It is a forecast, not a cost.

**Send back:**
- the report;
- `~/.toggle/local-claude/profile.json`;
- for any request in question, the complete request record in `~/.toggle/local-claude/requests/` and its CLI events in `~/.toggle/local-claude/events/`.

These files contain private brand material, so share them only inside the team.

Technical success is not creative approval: the AD judges the frames.

## 4. Back to OpenRouter

Settings → **Use OpenRouter**. New runs use OpenRouter; Local runs keep Local until they finish.

## Stops you may see

| Code | Meaning | What to do |
|---|---|---|
| `LOCAL_PROFILE_REQUIRED`, `LOCAL_DEVICE_NOT_SET_UP` | This computer has not been checked yet. | `npm run local-claude:doctor -- --fix --extra-usage-off` |
| `LOCAL_CLI_CHANGED` | Claude Code was updated since the check. | Run the check again. Runs that started on the old version stop with this reason, and a new run is needed. |
| `LOCAL_MODEL_CHANGED` | The pinned Sonnet changed since the run started. | Start a new run. |
| `LOCAL_DEVICE_MISMATCH` | The run belongs to another computer. | Run it on that computer. |
| `LOCAL_MODEL_MAPPING_REQUIRED` | A role uses a model with no agreed Local equivalent (only Flash → Sonnet and Claude → Claude are mapped). | Change the role's model or agree a mapping; nothing was sent. |
| `LOCAL_VISUAL_NOT_QUALIFIED` | The image check did not pass on this computer. | See the profile; text-only roles still work. |
| `LOCAL_ISOLATION_BROKEN`, `LOCAL_NOT_SUBSCRIPTION` | The CLI started with tools, MCP servers or an API key. | The call was stopped. Run the check again and send the profile. |
| `SUBSCRIPTION_LIMIT` | Your Claude limit is reached. | Nothing; the work waits and resumes. |
| `LOCAL_RESULT_NOT_DELIVERABLE` | A Local run cannot be accepted or delivered. | Run it on OpenRouter to deliver. |
