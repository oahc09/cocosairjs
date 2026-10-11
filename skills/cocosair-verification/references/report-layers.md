Derived from `docs/reference/verification.md`, `docs/reference/example-specification.md`, `tools/verify/verify-feature-exports.cjs`, `tools/verify/verify-custom-exports.cjs`, `tools/verify/example-spec-browser.cjs`, `tools/verify/devtools-examples.cjs`, `tools/verify/release-readiness.cjs`, `tools/examples/coverage-report.cjs` (as of 2026-10-10).

Cocos AIR verification answers three different questions. An agent that collapses them will over-claim, so keep each claim tied to the layer that actually produced it.

## Layer 1 - source-export claim

A symbol exists in the export surface and in the generated API inventory. `npm run gallery:api` builds that inventory from the AST of the declaration bundle, and a coverage report records each example's `api.claims` as `claimed` when the claim text matches the inventory exactly. This layer is a declaration: it says the name is published and referenced, not that it runs.

What establishes Layer 1: inspect the current declaration exports for the intended entry and the generated API inventory; a matching `api.claims` entry establishes the coverage claim. `build:dts` generates declarations for inspection. `typecheck` checks source types only and neither proves public export membership nor executes a scene.

What Layer 1 cannot prove: that the built bundle exports the name, or that the name behaves. `docs/reference/example-specification.md` states the separation explicitly: claimed comes from `api.claims` matching inventory, verified requires execution evidence.

## Layer 2 - default-bundle reachability

The name resolves inside the built `cocosair.module.js` for the default feature set. `npm run verify:feature-exports` reconciles capability names, feature units, aggregate exports and default bundle composition; `npm run verify:custom-exports` checks custom pipeline and post-process sources against their aggregate exports and the default feature boundary. `npm run verify:web-only` proves the runtime dependency closure excludes native, minigame and unregistered external code.

What establishes Layer 2 for a requested symbol: inspect the actual built export surface and check import or bundler resolution through the intended entry against that candidate. `verify:feature-exports` scans a finite set of bundle symbol texts and feature/export declarations; `verify:custom-exports` checks source/export mappings and default feature boundaries. They are structural regressions, not general resolution tests. `graphics-package.cjs` and `verify:consumer` exercise only the symbols and entries their assertions cover; do not extrapolate their PASS to untested exports. `docs/reference/verification.md` warns that a successful build and a Node import do not replace the browser check: "the browser runs the actually installed package; a successful build and Node import cannot substitute for it."

What Layer 2 cannot prove: that anything draws correctly. Reachability is structural. Typecheck or a successful bundle alone never establishes visual correctness.

## Layer 3 - real-browser behavior

A running page passes scene-graph, ready, functional, interaction, animation, lifecycle and pixel assertions in Chromium, Firefox and WebKit. Two spec-driven executors produce this evidence:

- `tools/verify/example-spec-browser.cjs` executes each example against its `example.json` spec: node-exists, node-count, asset-loaded, material-property, transform-equals, no-runtime-error, frame-diff, real pointer clicks, and the resource-released lifecycle contract.
- `tools/verify/devtools-examples.cjs` is the session gate for `requiresDevTools` examples, asserting the frozen agent-session contract rather than "did the scene boot".

Current coverage binding is implemented in `tools/examples/coverage-report.cjs`, not the older spec-only wording in `docs/reference/example-specification.md`. A run is fresh only when all of these hold:

- `result === 'PASS'`.
- `specFingerprint` matches the normalized current spec.
- `sourceFingerprint` matches the current example inputs computed by `tools/verify/api-trace.cjs`.
- `candidateFingerprint` matches the current runtime candidate.
- `apiProof` is an array with proof entries (an empty array is accepted only for an API-free `ui-shell` catalog).

Freshness alone does not mark all claims verified. Each claim must match the API inventory and have its own `apiProof` entry with `proof: 'verified'`; `proof: 'attested'` is counted separately. Report the `via: 'call'` and `via: 'read'` split when quoting verified coverage. Source edits invalidate the old source binding even when `example.json` is unchanged. Recollect evidence through the owning executor; do not patch stored fingerprints.

## What each layer can and cannot prove

| layer                 | question it answers                                 | gate that produces it                                               | does not prove                        |
| --------------------- | --------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------- |
| 1 source-export claim | is the name declared by the intended entry          | current entry declaration exports and inventory match               | bundle resolution, behavior           |
| 2 bundle reachability | does the requested export resolve in this candidate | actual export/import inspection and a scoped consumer/bundler check | untested exports, pixels, interaction |
| 3 browser behavior    | does it draw and react correctly                    | example-spec-browser, devtools-examples, browser-matrix             | release readiness from a subset       |

## Declared versus executed

Both browser executors enforce that every validator id the spec declares must have actually run: if a declared validator has no executor pass, the runner synthesizes a failure ("declared in Example Spec but no executor ran it"). This blocks the "claimed without executed" pattern where a spec lists checks that never execute yet the example is marked PASS (`docs/reference/example-specification.md`).

## The coverage check chain

`tools/examples/coverage-report.cjs` recomputes claimed versus verified from the inventory, the example specs, the runtime evidence and the fingerprints. `npm run verify:api-coverage` writes its report; passing the regression floor still does not establish release readiness, because the floor is a minimum, not completeness. `verify:release` runs the coverage `--check` mode and requires the report, the specs and the runtime evidence to agree (`tools/verify/release-readiness.cjs:26`).

## Honest evidence status vocabulary

- PASS - the gate executed and every declared check succeeded in this run.
- NOT_RUN / BLOCKED - a valid, honest report state. A well-formed NOT_RUN or BLOCKED report is not a gate PASS; `npm run verify:port-evidence` treats a valid NOT_RUN as disclosure, not success.
- UNSUPPORTED - only after capability discovery reports the gap; distinct from a failure (see [playwright-prereqs.md](playwright-prereqs.md)).
- Subset - a partial run, marked by subset flags or `COCOSAIR_GALLERY_EXAMPLES`; never aggregates to full acceptance.
