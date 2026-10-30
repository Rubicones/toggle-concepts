# Revision request duplicated sealed-design metadata

29 October 2026. No tests/build or paid calls were run.

Block `509d9154-b745-423e-a51b-e7c72e1b799b` stopped before its first director request. It was a new revision, not another coder turn. The previous sealed design occupied 38,178 bytes: 22,760 bytes of material memory, 3,727 bytes of reference bindings, and the remaining authored document, key frames, image briefs and observations. The compactor shortened the previous document but resent all its derived memory, even though current material/identity context was already supplied separately. The saved failure bound was 69,710 against the 65,536 ceiling.

The shared request packer now strips historical material memory and duplicate reference metadata from previousDesign before sizing. Resource aliases actually mentioned in the previous design prose remain available. The complete authored document, key frames, resource briefs and observations remain exact. The complete original sealed design and provenance stay saved. This applies across callers instead of relying on one worker path to construct a slim revision correctly. The old truncation of previous design prose was removed.

Read-only sizing of the actual saved revision after metadata removal: 51,402 / 65,536 with both required reference images. The calculation confirmed the previous design document and resource briefs were unchanged. A final refinement additionally retains referenced resource aliases; the resulting small alias list has not been remeasured. No shared state, allowances or model requests were changed. No migration is needed. Refresh and retry the compacted request within the existing allowance.
