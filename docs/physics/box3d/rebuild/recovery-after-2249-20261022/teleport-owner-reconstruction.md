# Newly reconstructed finite teleport candidate

This source snapshot combines the byte-exact recovered neutral grant source, byte-exact recovered target-settlement queue base, a newly rewritten cancellation admission latch, and three newly reconstructed owner/World/SharedBody sources. The nine teleport fixtures are new reconstructions; no original per-file fixture hashes are known. Original checkpoint40 raw is unavailable. No historical PASS counts are reused.

Internal teleport uses the actual owner queue, whole-submission fences, immutable copied commands, effective-only disabled-component wake suppression, one native validation/application/solver chain, native-origin writeback including disabled reset participants, and pre-native exact grant reservations. Target handles and persistent target writeback remain unimplemented; public activation remains false.

All fresh tests are NOT_RUN at this source-only persistence boundary. The next step is new strict TypeScript/source controls and actual restored N4 WASM execution, with each completed raw batch externally saved immediately. All 2,128 formal cells and nine Gates remain NOT_RUN.
