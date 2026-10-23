# Fresh 40b teleport archive-only semantic review

Result: PASS_LIMITED_ARCHIVE_ONLY_CLOSURE, verifier exit 0. This is new evidence collected after environment recovery, not the vanished original checkpoint-40 raw.

## Verified inputs and observed totals

- Candidate input HEAD: 38e18167135d9e4be1d6d8e22d7b936afc8ebc13.
- Nine actually downloaded ZIPs: one shared input package, six actual-case batches, one lock-contention batch, one final index package.
- All 2,422 ZIP members were read/CRC checked and SHA-256 verified against pinned ZIPs and exact inventories.
- 1,596 source inputs; all 1,601 frozen-tar members; 2,239 compressed/decompressed runtime content objects; 2,744 unique runtime paths per case.
- Exactly eleven named actual cases, 145 recorded passing checks. No missing final case or indexed archive.
- Source map digest: aad5092940b314ace9fe3cf2f261d83c1926866b528b12b6b7a10fb6d0bd0438.
- Frozen tar SHA-256: 7b8b1579d6558dfa825263f24d4c66b58f73e0cf2b49b17e349c7594fd97ca90.
- Final index JSON SHA-256: 248f3ddaf62a51eb7edb5e7f0b2223bb5839ab53da1edb35e78aa5f5b9dfdb3c.

## Explicit closure

The reader binds sourceHashesBefore/After to the complete shared source map and frozen tar. It binds native build-input hashes, native manifest, mjs/wasm/facade artifacts, copied native manifest/receipt, case receipts, raw native reports, launch/result HEAD and exit, collector stdout and captured Jest stdout/stderr. Every JSONL runtime record resolves solely to a ZIP gzip object and verifies decompressed SHA/size, plus agreement with any frozen-source overlap. It checks recorded native validate/apply/step order, empty second apply and tracked teardown. Final index case counts/check IDs, raw/receipt/runtime hashes and package/Library identities are cross-linked to those same bytes. Full archive inventories are exact; unknown extra members are not silently accepted.

The native manifest's facade.d.mts is closed using the identical frozen source declaration, rather than pretending a nonexistent native-output declaration is in the tar. This explicit same-hash substitution is reported per case.

Case 11 is intentionally a rejection path: the caught cancellation getter aborts the outer teleport; first tick contains only the retained original linear impulse; second batch is empty. It must not be forced to contain a reset.

Lock contention is a separate expected exit-1/COLLECTOR_BUSY control, not case 12 and not qualification. Its byte-identical sentinel, no-child/no-native/no-frozen-publication and source-after subset are checked. The early-abort receipt has 1,551 source-after entries, no source-before, and excludes 45 build-only inputs; it is not represented as full before/after evidence.

## Negative controls, then positive checks

1. Omit batch 10–11: exit 2, INCOMPLETE, names invalid-getter and invalid-getter-cancel missing.
2. Wrong shared ZIP SHA: exit 1, ZIP hash mismatch.
3. Point JSONL to absent runtime object while rehashing enclosing JSONL/receipt/batch/ZIP: exit 1, Missing/foreign runtime object reference.
4. Physically remove gzip member and repin changed shared ZIP: exit 1, Missing referenced ZIP member.
5. Change one before-source hash and rehash enclosing receipt/batch/ZIP: exit 1, Source before/after mismatch.
6. Unmodified final package set: exit 0, PASS_LIMITED_ARCHIVE_ONLY_CLOSURE.
7. Relocate all nine exact ZIPs to neutral archive-N.zip names, run unchanged Library-readback verifier from /tmp with an audit hook: exit 0. After standard-library preload, exactly ten reads occurred: one explicit plan plus nine explicit ZIPs. Any other filesystem read was rejected. No original workspace path supplied missing bytes.

The first portability harness attempt rejected a lazy Python locale standard-library import. Its failure remains in history; the second preloaded locale/cp437 and argparse before enabling the same strict audit. This was a harness setup issue, not evidence closure failure.

## Reproduce

Obtain the nine Library ZIPs in portable-archive-layout.json, preserving each listed SHA-256, and name them archive-0.zip through archive-8.zip beside portable-plan.json. Run:

    python3 -B verify-teleport-batch-closure.py --plan portable-plan.json

The script only needs Python's standard library. It reads no archive-stored absolute path from disk. Missing final cases/index/control remain INCOMPLETE (exit 2); malformed or broken references FAIL (exit 1). An absent specified ZIP also fails closed. Actual package sizes/counts come from manifests and observed bytes, not invented expected totals.

## Scope and limits

This is a portable explicit semantic-closure reader, not a universal parser of all arbitrary JSON strings/text references. It does not recursively qualify historical native build logs or interpret derived index wake/cancel narrative fields separately; their referenced raw/check identifiers and digests are bound. It does not prove producer authenticity, reproduce the simulation, or independently prove the physics. No old invalid or missing raw is credited. Source-only reconstructed fixtures freshly executed in this new run are not equated to unavailable original fixture bytes.

All 2,128 formal cells remain NOT_RUN. All 9 Gates remain NOT_RUN. Finite Node actual WASM is not browser, SDK, persistent-target or public-feature qualification.

## Verifier preservation and change scope

Only the authorized repository file tools/verify/box3d/verify-teleport-batch-closure.py was added. No product/fixture/HEAD/Git/remote changes were made by this review. The final frozen v3 is 30,813 bytes, SHA-256 d44fbbca59d2bff30c0c825ed511d60371350cd286e0510f2b58bbf89e3a9e5a. It was saved to Library and actually read back before long validation (libfile_2d127dd2817c81918d25c839f5f47e8d). The repository copy has remained unchanged after that final byte set was frozen for sibling runtime discovery.

Earlier verifier v1 over-required reset/before-close on case 11; v2 over-required the lock-control early-abort source subset to equal the final native-input map. Both reader-assumption failures are retained and corrected in v3 without rewriting producer evidence. No evidence files were modified. All mutations for negative tests were made to isolated copied ZIPs only.

No blocked, denied, pending or uncertain action remains in this review.
