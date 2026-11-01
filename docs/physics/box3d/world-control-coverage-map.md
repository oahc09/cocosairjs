# World-control coverage and historical migration

## Current source check — 2026-11-01

`node --test tools/verify/box3d/world-control.test.cjs` passes **37/37** current
CPU tests. The current harness executes actual owner/adapter/material transactions
with explicit engine/native seams; it is not native physics or browser evidence.
It now appears in the optional `integration-20261031/verify-current.cjs` runner.

This result does not qualify the separate historical 79 failed suites or establish
that every old adverse case has equivalent current coverage. The prior failure and
migration notes below remain a record of the 2026-10-31 checkpoint.

## Retained 2026-10-31 checkpoint

`tools/verify/box3d/world-control.test.cjs` is retained, not skipped or declared passing.
The 2026-10-31 merged-source run fails in its recursive VM loader on
`internal:constants`. It predates the engine-owned command, material and clock
contracts. Adding that alias alone does not repair the harness:

- Its adapter call omits the required `ownerEnvironment.physicsSystem` reader and
  actual `PhysicsSystem` identity.
- Its binding lacks `trimEmptyWorld`, `validateCommandBatch` and
  `applyCommandBatch` required by the current bridge guard.
- Its direct `world.step()` calls do not enter the engine-owned clock frame.
- Its plain-object default-material mutation does not establish accepted material
  identity or the current material authority scope.

Do not add a permissive command-owner stub or weaken production guards to make
those obsolete setup assumptions pass. A future rewrite must use real engine
ownership and retain the original adverse native/readback/rollback assertions.

## Relevant current tests (coverage references, not a claim of equivalence)

All paths below are relative to `tools/verify/box3d/`. Their presence is **not** a
PASS result; use fresh per-run logs and input identities for execution status.

| Legacy concern                                               | Current test/source to use when migrating                                                      |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Actual owner identity and activation                         | `owner-component-real-wasm.test.ts`, `owner-activation-real-wasm.test.ts`                      |
| Clock admission and Game pause/resume                        | `owner-clock-real-wasm.test.ts` (finite actual Game reason and owned clock case)               |
| Accepted material identity and initial values                | `material-identity-b1-control.test.ts`, `body-component-real-material-initial-control.test.ts` |
| Material cleanup and adverse outcomes                        | `material-cleanup-control-green.test.ts`, `material-cleanup-control-red.test.ts`               |
| Ownership cleanup, retained work and empty-world reclamation | `empty-world-release.test.mjs` (explicit CPU mocks; not native qualification)                  |
| Public feature lazy preparation and terminal module release  | `public-feature-wiring.test.cjs` (explicit loader/adapter mocks; not native qualification)     |
| Real browser example lifecycle                               | `compound-bowling/browser-lifecycle.cjs` (EX02 limited scope; not a native leak census)        |

The public wiring fixture now implements the current lease diagnostics contract
and separately checks missing, nonterminal and failed-disposal receipts. It does
not turn mocked receipts into native release proof. The legacy suite's remaining
coverage is an open migration item, and aggregate test status must not be reported
as all-green while it fails.
