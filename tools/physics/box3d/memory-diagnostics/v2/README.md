# Memory diagnostic v2 production-source candidate

This new profile retains the original 87 ordered capacity-ledger rows and appends
`worldFixed.identityHistory` (the actual `sizeof` fixed identity history, 36 bytes
in the qualified layout) and `worldFixed.creationCapacity` (20 bytes). The complete
89-row / 756-word result must exactly equal the new patched core ledger. These
embedded values are not extra malloc allocations. Module requested bytes and true
native global bridge ownership remain separate scopes.

Version 1 evidence and its profile files remain historical; old SDKs cannot satisfy
the new production main-schema/patch-chain identity. No v1 observation is rewritten.
The readonly query does not trim. The separate explicit same-world release command
requires retired external views and event ACK; app hook execution is qualified by
separate storage native/WASM and real APP gates. Source/CPU success is not runtime.

After-app-close observation remains unavailable. Initial capacity baseline belongs
to the current implementation (including its fixed metadata), never historical 36040. Strict C20 equality, fixture and 100-scene target are unchanged.
