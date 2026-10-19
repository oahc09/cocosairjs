# Rendering P1 entry pilot

## Result and scope

The rendering entry pilot is ready for independent review. It has not authorized or started the other 21 body migrations.

- `skills/cocosair-rendering/SKILL.md`: 3,314 UTF-8 bytes, below the 4,000-byte limit; 52.73% smaller than its 7,011-byte S2b attempt 3 entry and 60.93% smaller than its 8,482-byte prerequisite entry.
- Its frontmatter is byte-identical to S2b attempt 3: 1,077 code points; description 154 code points.
- Seven short trigger bullets, at most seven whitespace-separated words each. The original nine detailed bullets and original heading remain in the new `references/triggers.md` (1,905 bytes).
- `references/context.md` (6,922 bytes) preserves the original context and appends original entry guidance, mistake navigation, the complete original description/description_en value once with explicit deduplication, the complete original keywords value, the original References list, and Canonical docs.
- Five real Markdown links form the Reference map. Rows are 72–79 ASCII characters/bytes. The existing generator parses them to five nonempty reference answers; the rendering-only compact object is 1,213 code points. No index file was generated.
- Changed skill files are exactly the entry, context, and the new triggers reference. Other skills, large topic references, common-mistakes code examples, tools and fixtures were not edited by this pilot.

The summary now says “A second directional light is not an independent fill light.” The earlier wording, “replaces the main light,” was corrected before final evidence collection to avoid an unconditional selection claim.

## Preservation and navigation

`rendering-pilot-ledger.json` contains 16 source-block/metadata mappings against prerequisite snapshot `46a9449ad54586ae70a914a77992801ea732270ab7f14509f40bf3792ee22d9d`. Every entry records source/destination hashes, explicit link maps and implementation-agent preservation self-review. It does not claim an independent review.

Both original description fields explicitly use `deduplicate`, map to the same complete standalone paragraph, and record their equal original JSON-value hash. The removed Related skills heading maps by explicit exact-text deduplication to the original context heading; its original explanatory paragraph is separately archived. No summary is the sole preservation copy.

The full live tree passed `check-paths.cjs`: 192 Markdown files, 22 skills, 534 links, zero failures. The source annotations under Canonical docs are unchanged checkout-root literals; local Markdown links moved into references were rerooted to identical logical targets. A prefatory Contracts link in triggers resolves the retained original “Contracts” mention.

## Isolated G4 evidence

The validation directory is outside the live repository: `../cocosairjs-rendering-pilot-validation`. It was created by copying the full live repository, then restoring only the other 21 `SKILL.md` files from the prerequisite snapshot. Rendering files match the current live bytes. `rendering-pilot-change-scope.json` verifies the only live-versus-isolated skill differences are those 21 restored entries.

The exact final command was:

```sh
node tools/skills/verify-lossless.cjs \
  --snapshot ../cocosairjs-skills-prerequisite-66d11fd0 \
  --root ../cocosairjs-rendering-pilot-validation/skills \
  --ledger ai/plans/skills-token-evidence/recovery/rendering-pilot-ledger.json \
  --phase P1
```

`rendering-pilot-lossless-final.json` and its `.exit-code` record PASS / 0: 3,265 original units checked, 3,249 unchanged units, 16 approved implementation self-review mappings, zero issues. The isolated candidate hash is `956c72dae4460874dc12735434249e4c098f6987f57f7c6f5e07518e6e1b48a2`.

This is a rendering-only preservation PASS against the prerequisite corpus. It is not a live-suite G4 PASS: the other 21 entries retain S2b metadata changes whose original values are not yet archived. The earlier `rendering-pilot-lossless.json` retains the successful pre-wording-correction attempt; only the `-final` report fingerprints the current entry.

## Evidence files

- `rendering-pilot-ledger.json`: explicit preservation ledger; SHA-256 `df9ebd0f5f34dfd1b371da385e22bdcf77084918949a5977d9f3d329e4b0ae3e`.
- `rendering-pilot.diff`: entry diff against S2b attempt 3; context diff against prerequisite; new triggers diff.
- `rendering-pilot-live-paths.json` and `.exit-code`: full live navigation PASS / 0.
- `rendering-pilot-format.txt` and `.exit-code`: Prettier check of all three edited source files PASS / 0.
- `rendering-pilot-budget.json`: official `validateRecord` rendering-only entry validation, full-suite unchanged host contracts, and in-memory rendering index feasibility. This is not a final full-suite G1/G2 or generated-index check.
- `rendering-pilot-live-measure.json` and `.exit-code`: actual full-live-tree static measurement / 0, not a claim that other entry budgets already pass.
- `rendering-pilot-isolation.json` and `rendering-pilot-change-scope.json`: restoration list and byte/hash scope checks.

All three source files were formatted before destination block IDs and hashes were collected. Original metadata and every migrated block were read and compared to their retained full-text destinations. Independent review is still pending. No commit, push, PR, final index generation, P2 slicing or shared-reference refactor occurred.
