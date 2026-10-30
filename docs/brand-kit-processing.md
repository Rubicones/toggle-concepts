# Incremental Brand Kit processing

The Brand Kit source reader fills a versioned field catalog. It does not generate
one complete twelve-rule kit from all files. Missing fields remain empty. Results
are proposed evidence; choosing a candidate does not grant A1 or confirm licensing.

## Fields (catalog `brand-fields-v1`)

Candidate arrays: brand name, wordmark, icon/symbol, primary colors, secondary
colors, semantic/UI colors, display fonts, body fonts, monospace fonts, font files
and licenses, image treatment, photography, illustration, sound.

Accumulated text: brand description, logo usage, product identity/protected
details, typography rules, spacing, grid/layout, safe areas, motion, brand voice,
tone, copy rules, prohibitions, accessibility, localization.

There are 28 fields. Each holds any number of separately cited findings. Original
wording, color notation and source-specific names stay together. Alternative
candidates are retained for the AD; later evidence does not overwrite earlier
findings or human decisions. Text can be combined for reading, while its separate
source references remain available.

## Operator flow

1. Upload/drop a folder, files, images, fonts or documents; or paste notes/images.
2. Local extraction saves text parts and visual pages. Wait for included files to
   be extracted, or explicitly exclude unreadable sources.
3. Choose a maximum USD price per agent request and start **Analyze new / unfinished
   files**. Existing preparation/run and cumulative role caps remain in force.
4. The local reader handles one file at a time and one source part/page at a time.
   It saves returned field records before making the next paid request. A field
   can accumulate further records over any number of response pages.
5. Open fields to inspect citations. **Use this**, **Exclude**, **Leave undecided**
   and edited working wording are saved to Supabase immediately, with versions.
   Original extracted wording is retained.
6. Pause/resume or stop remaining work through the interface. Completed source
   versions are not re-read when analyzing newly added files. A budget block
   retains all results and the unfinished cursor; resume does not reset charges.
7. Download all findings and decisions as a streamed NDJSON artifact. The field
   viewer paginates records; there is no aggregate forty-item rejection.

The per-request price allowance can be changed explicitly while paused/blocked;
this does not change the cumulative role/run caps or rewrite old requests. Missing
budget causes a stop before another provider submission. A response that reaches
its token ceiling retains complete validated records and continues as a new
accounted page. If it contains no complete records, a text part can split losslessly
into smaller parts. Invalid rows do not erase valid neighboring records. An invalid
or non-progressing part blocks with its saved findings; the operator can explicitly
skip that file. Unknown provider submission outcomes are held for reconciliation
and are never blindly resubmitted.

## Storage and limits

Migration: `supabase/migrations/20261025001300_incremental_brand_fields.sql`.
Apply through Settings → Copy Incremental brand fields migration → Supabase SQL
Editor → Run, then refresh Brand Kit. Normal operations require no shell commands.

Text/document totals and finding counts are not whole-pack schema limits. Long
content is stored in separate `studio_brand_material_parts` rows. Analysis files,
parts/cursors, immutable provider receipts, individual findings, and AD decisions
are stored in Supabase. The worker runs locally; Next.js only admits commands and
reads saved progress. C1/C2/C3 and A1/A2/A3 remain separate and unchanged.

The current binary upload transport is 50 MiB per file. Supported formats remain
images/SVG, PDF, DOCX, supported legacy Word/RTF conversion, text/Markdown/CSV/JSON
and TTF/OTF/WOFF fonts. Codec/converter support, local memory/disk/time and safe
archive expansion still impose technical limits; unknown formats are not claimed
as readable. A legacy GIF supplies its first frame. The source file remains
available, and extraction warnings are explicit. Extremely large binary uploads
would require a resumable upload transport rather than silently raising memory use.

The source-field workspace is the persistent analysis result. The campaign's
editable A1 rule/revision editor remains a separate authored production artifact;
there is no automatic approval or silent conversion of all candidates to renderer
tokens. Earlier whole-pack attempts remain available as historical records.

## Continue, review and submit an unfinished brandbook

**Continue work** resumes an active, paused, budget-blocked or stopped analysis at
its saved part/page. Completed and explicitly skipped work stays as recorded. A
page blocked solely because all returned findings were duplicates can advance to
the next part through this explicit action. Other invalid or unknown submitted
responses still require review; continuing never silently repeats them.

Field cards expand their findings inline, next to the clicked heading. Search and
filters show fields with findings, fields needing review, chosen candidates or the
full catalog. Source progress and processing settings have separate disclosures.

The budget graphic shows charged/reserved/available money, actual input/output
usage, current reserved output allowance and an estimated maximum number of output
tokens affordable at the last quoted output price. Future input costs also consume
that money. Missing usage/pricing is labeled, not invented as zero/free usage.

**Submit current brandbook** is available once there is a non-excluded finding.
It allows unfinished files, empty fields and undecided candidates. Migration 014
saves an immutable numbered submission and copies its evidence, decisions and
edited/original wording into version items. New findings and later edits do not
change it. The latest submitted version is the campaign's canonical brandbook
head and can be downloaded separately from the live findings. Submission does not
pause analysis, require C1, or grant A1 approval. Further work can be submitted as
a new numbered version.

Enable this update via Settings → Copy Brandbook workspace migration (014) →
Supabase SQL Editor → Run once → refresh. The update retains all findings,
processing positions, previous charges and cumulative caps.

## Incremental notes and brief prefill (migration 015)

Use **Save & analyze only these notes** to save typed text as a new source, wait
for free local extraction, and queue only that source for Gemini. Every extracted
source also has **Analyze only this · paid**. Selected work uses the existing
preparation/C1 run, frozen models and cumulative request/role/run caps. A currently
submitted request must finish first. An older blocked file stays blocked and its
findings, cursor and charges are preserved; an idle active session is paused.
Already queued unfinished sources must use their existing continuation path.

The reader stores explicit questionnaire evidence alongside the 28 brand fields.
It extracts only supported product/objective/audience/markets/offer/CTA/destination/
immutables/synthesis/rights-notes/variation-notes answers. It does not infer these
from colors or marks, grant rights, confirm prices or change scope. Brief-only
pages count as saved progress and are included in subsequent pagination context.

Submitting a brandbook now fills unanswered questionnaire fields from its saved
snapshot and previously saved brief evidence. Older submissions have **Fill
unanswered brief fields**; no agent call is needed. Existing descriptions and
product invariants can fill product/immutables without reprocessing old files;
explicit structured questionnaire keys in old findings are recovered too. Missing
answers remain blank, conflicting candidate answers are left for review, and
manual answers and fixed C1 submissions remain untouched. Brief contract-length
limits create visible excerpts, while full source values remain stored. The brief
shows its prefill provenance; source records and submission/version linkage are
saved in Supabase. Request idempotency prevents duplicate applications.

Apply **Brandbook updates** from Brand Kit or Settings → copy/download → Supabase
SQL Editor → Run once → refresh. File: 20261025001500_brandbook_brief_updates.sql.
