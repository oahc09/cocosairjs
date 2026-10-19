# WebGL2 audit batch A

This PR targets main after PR #5 was merged. It implements ENGINE-001/002/004/005: program recovery independent of PSO identity, exact stencil write-mask restoration, actual-stream vertex offsets and active-location limits, and scratch-blit attachment/buffer reset with external binding restoration.

## Integration correction

The first candidate rejected reflected location -1 (`gl_InstanceID` in Chromium). Same-runner Spark A/B run 39222443642 passed frozen main and failed that candidate. The correction ignores -1 in validation and both VAO/non-VAO binding, regardless of name. Invalid streams and matrix location overflow remain errors. Built-in/inactive inputs and the last valid matrix slot have regression cases.

## Verified results

- 20 new GFX cases plus 12 existing command contracts; complete focused Jest suite 148/148.
- Renewed real WebKit command readbacks 11/11 against corrected source SHA-256 db6175d1559676295c039f7ca0894132271a171043cebbfeb587c9b27e1b0f6b.
- Five real Chromium examples passed functional, pixel, resource and physical-close admission in runs 39223341041, 39224042838 and 39225297967.
- Corrected Spark baseline/candidate A/B passed on the same runner (39224042812); neither produced page errors.

These are scoped smoke results, not complete device/application coverage. An earlier isolated shutdown timeout remains historical evidence; no timeout or threshold was relaxed. Temporary A/B and close-phase diagnostics are removed after validation.

## Generated artifacts

All seven runtime outputs are from source e229ee13255f8f78284354f0f2e8ad2b69f504bf, build number 185, artifact 12172992282/run 39224042812. Dev/min and both original maps are committed; declarations match main byte-for-byte. Both maps' embedded GFX source hashes match the corrected source. The temporary map-import job wrote only the two allowed map paths, then its workflow and write permission were removed. Provenance and scoped validation receipts are in ai/ledgers/webgl2-audit-evidence/.

The earlier 005ebacc runtime and receipts are superseded, retained only as history. The 64-item ledger preserves the 19 SDK partial stages; SDK continuation is a separate PR. Application patch submission remains paused. No automatic merge or deployment.
