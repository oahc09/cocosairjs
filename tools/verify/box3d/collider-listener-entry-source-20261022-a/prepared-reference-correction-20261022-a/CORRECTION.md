# Preparation-reference preservation correction

The original archive omitted four earlier source versions referenced by prepared-fixture-manifest.json. A read-only search of all candidate-directory files and all original archive members found no exact surviving copies before recovery. This was a preservation error, not a failed actual-engine test.

The manifest was captured at 2026-10-22 18:05:33 UTC with actualEngineRunStarted=false. Afterwards:

1. actual-engine.test.cjs gained ten controls for automatic once/invalid-target removal, unrelated leases and overlapping leases.
2. overlay-resolver.cjs and run-actual.py gained before-current owner snapshot support.
3. DESIGN.md was updated to explain the newer owner snapshot.

The earlier versions were not separately retained. None was used in actual-engine Jest execution. The first actual run started at 18:07:56 UTC, after all four edits; its own inputs and the GREEN run's inputs remain preserved with unchanged hashes. The prepared test/config files had only been syntax/format checked. DESIGN.md was documentation, not executed code.

The four files under recovered-prepared were reconstructed by inverting these precise, recorded later edits. Each reconstructed byte sequence exactly matches its SHA-256 in the unchanged preparation manifest. They are explicitly recovered files, not falsely presented as copies that survived the initial archive.

- actual-engine.test.cjs: 6dc2c776dbff9083e1dc9ac024ed58a0f0ff1c2ee386696259b7a895b686d70a
- overlay-resolver.cjs: 246b4c97c77c264457eafa6d24037868c3cec79b52df11ebc180045a54b8afe4
- run-actual.py: 21999bd2dfd3956ebc357f765570a226d3ba9cb66b1fbfe4ef0625e58b1b8ec1
- DESIGN.md: 8a3bc65ef65c15f768c9f4932bfb70bcff8089fe09245aa23b2d921f4a28bb6e

The original manifest and candidate-evidence.tar.gz remain unchanged. correction.json records the search scope, exact recovery hashes, current-file modification times, actual run times and a bounded seven-reference resolution check. The original archive's 81 file-manifest checks only proved included-file integrity, not full reference closure. Only the seven preparation-manifest references are asserted resolved by the original archive plus this correction.

Prevention: snapshot every preparation-manifest input at manifest creation before any later edits; separately validate referenced digests, rather than relying only on the archive's own file manifest.
