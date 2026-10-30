# Repeated director allowance exhaustion

29 October 2026. Inspected saved data and implemented without running tests/build, as requested.

The current block recorded **12 paid director requests costing $0.862542** and one recovered unsubmitted claim costing zero. Five paid responses were complete JSON answers, approximately 10,400–11,700 characters, rejected as `UNISSUED_SCENE_ID`. The remaining seven paid answers reached their output limit.

Two application bugs caused the repetition:

1. Hook-specific storyboards and their app-issued scene UUIDs were sent to the director. Reference normalization, design validation and preview readiness accepted only the four base-storyboard scenes. Complete replies containing the twelve authored base/hook key frames were therefore rejected. One shared catalog now supplies all authored scene identities; base scenes remain required, optional hook scenes are accepted only when actually issued. Unknown/ambiguous identities remain blocked. Reference failures now identify the offending reference and allowed IDs.
2. Legacy director grants supplied 12,000 aggregate output tokens for two requests. Continuation allowed a 12,000-token answer, but the ledger silently reduced the following answer to the remaining 3,797–6,404 tokens, including model reasoning. This caused predictable truncation. Director requests now require their full requested output allowance before submission. New quotes price 24,000 output tokens for two 12,000-token answers. Existing frozen financial grants are unchanged; insufficient remaining output produces an allowance stop before another partial paid answer is requested.

The latest saved complete response **passes corrected reference/schema/resource validation locally**: 11,661 characters, twelve key frames, four resource briefs. No model call was made to obtain or repair it. The design stage revalidates saved complete answers before spending another director attempt, including when the old attempt ceiling has been reached. Partial token-limit output is never accepted by this recovery.

The workspace offers **Use saved director answer · no new director call**, replacing the additional-allowance offer when a valid saved answer exists. It queues local revalidation through the existing audited, idempotent control mechanism. The worker retains paid receipts and feedback, emits the design-ready event, and continues pictures/coding within existing approvals. The action does not grant money, reset attempts, or bypass resource permissions. No migration is needed for this fix. No shared state was changed during inspection.

The generated brand module now exposes the same scene catalog in the workspace and live preview; its alternative-storyboard type retains every authored scene field. Creative layouts and copy are not synthesized or assigned by application code.
