# Native observation staleness regression

A review found that a native gravity/sleep/material mutation could invalidate the native snapshot and then fail its readback or rollback, while the AIR fault diagnostics still labelled the previous step's native observation as current.

The prior 30-test checkpoint remains unchanged in `../world-control-checkpoint-20261022/`, including its source archive and successful receipt. `red/` retains a formatted test-source snapshot and an actual failing run against those prior world bytes: 30 passed, four failed. Each regression first completes one mock native step, then performs a native mutation followed by readback/rollback failure and requires the observation to be marked stale.

The fix calls `invalidatePending()` immediately before each potentially mutating native setter: gravity, sleeping, inherited-material writes, material rollback writes, and default-material application when adopting a shape. Local invalid arguments and material-token preflight still precede mutation. `fault()` is unchanged, so a step exception followed by a successful diagnostic read still preserves its known native outcome and current observation. Two existing step tests explicitly assert that behavior.

`green/` records fresh format, 34 mock-control tests, and focused project-target type checks, with before/after hashes. The patches reproduce the current source/test delta from the prior source archive; no native bridge, upstream setter, public registration, or real physics claim is added. A stale `native` object remains historical information and must only be treated as current when `nativeObservationCurrent` is true.
