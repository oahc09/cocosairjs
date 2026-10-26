# Recover the persisted runtime build counter

This is recovery of an already-used compilation number, not a new build or a passing gate.

At source commit `ae0803c0c3e85aa627666f76eef29c4e62ab2e93`, the tracked counter still says `lastBuildNumber: 222`. The previous execution workspace successfully produced runtime **223** from `b089d223aad1bb4be4a81f187eceb341510d766a`; its increment had not been persisted to this branch. The workspace containing that local counter is no longer available in the current execution environment.

Committed historical evidence records the distinct runtime identity:

- [SDK223 EX03 initial observations](sdk223-ex03-initial-observations-20261025.md): producer `b089d223aad1bb4be4a81f187eceb341510d766a`, runtime build 223.
- [SDK223 EX02 observations](sdk223-ex02-initial-observations-20261025.md): the same producer and runtime build, with retained artifact references.
- [SDK223 channel regression](sdk223-ex03-channel-regression-20261025.md): the same runtime identity, independently distinguished from later example-source commits.

The recorded SDK223 ESM SHA-256 is `81aaa7258bdd59f5400cd1767463c0019746c809af75901f765d11f6d7f8a70f`. This is a historical fingerprint, not a claim that those original bytes or the old raw browser downloads were recovered today. The restored archive is an older input projection and must not be relabeled SDK223.

Set the persisted last-used counter to **223** so that the next non-Spark module compilation (planned as ESM) reserves **224**, rather than assigning 223 to different Terrain ABI bytes. Do not edit historical reports, old runtime identities, or old failures. Native ST builds do not consume this JavaScript compilation counter.

No new ESM build has been run by this counter repair. A future build must retain its actual source, native ST identity, inputs, outputs, exit status and counter transition. Build 224 remains **NOT_RUN** until that fresh compilation actually succeeds.
