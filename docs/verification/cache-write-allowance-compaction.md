# Cache-write allowance mismatch

29 October 2026. No tests/build, provider submission or shared mutation performed.

The revision's conservative raw input bound was 51,402. Admission reserves billed input equivalents at the frozen cache-write price, approximately 1.25 times the base rate: **64,253**, above its **64,000** approved input allowance. The UI misleadingly displayed the raw count in that comparison. No requests or billed tokens had actually been used in this revision block.

The worker now obtains the remaining billed input allowance and converts it to a conservative raw ceiling before compaction. That allowance ceiling is separate from the hard request-size limit; the declared 64K hard cap remains compatible with SQL admission. Admission still rechecks the current billed usage, output, requests and monetary allowance after compaction. Error details now show billed equivalents and their raw input bound in the same comparison. No pricing or financial guard was relaxed.

Read-only sizing of the actual saved request produced **44,745 raw / 55,932 billed equivalents**, within the unchanged **64,000** allowance, with both required images retained. The raw allowance ceiling was 51,199 due to conservative floating-point rounding.

The unused legacy stop offers **Retry within existing allowance** rather than another allowance purchase. This uses the existing audited/idempotent control queue and does not reset attempts or enlarge caps. It is restricted to the director phase before its assembler loop and to the exact legacy zero-used input-budget stop. A genuine later allowance shortage retains its normal priced continuation path. No migration is required.
