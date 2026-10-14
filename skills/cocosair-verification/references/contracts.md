Derived from the cocosair-verification skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

# Contracts

Three report layers, and each layer is independent evidence (`docs/reference/verification.md`):

1. Source-export claim. A symbol appears in the export surface and the API inventory. Coverage reports call this `claimed`. Check the intended entry's current declaration exports and inventory. Typecheck checks source types and does not establish public export membership.
2. Default-bundle reachability. The name resolves through the actual export/import surface of the built default entry. `verify:feature-exports` and `verify:custom-exports` check scoped structural invariants and do not prove arbitrary symbol resolution. A successful bundle plus a Node import does not establish visual correctness.
3. Real-browser behavior. A running page passes scene, pixel, interaction and lifecycle assertions in the browsers tested. Coverage requires a PASS with matching spec, source and candidate fingerprints and an `apiProof` array; each counted API needs its own `proof: 'verified'` entry. Report `via: 'call'` separately from `via: 'read'`. See [report-layers.md](report-layers.md).

Write gates versus read-only gates:

- Read-only (terminal output plus exit code, no canonical repo writes): `verify:web-only`, `verify:file-map`, `verify:licenses`, `verify:doc-refs`, `verify:wasm-backends`, `verify:custom-exports`, `verify:feature-exports`, `verify:example-chain`, `verify:port-evidence` (with `--selftest`), `verify:release`. `verify:doc-refs` writes a report only with an explicit output option; `verify:release` needs a clean Git worktree (see [gate-catalog.md](gate-catalog.md)).
- Write gates (rewrite repository content despite the `verify` name): `verify:api-coverage` rewrites `api-coverage-report.json` under `docs/`; `verify:v06-gate` rewrites the `v06-review-gate.json` under `docs/evidence/` and `v06-final-gate.md` under `build/reports/`; and the browser evidence collectors `verify:browser-matrix`, `verify:perf-lifecycle`, `verify:tarball-consumer` and `verify:g3-dev` each rewrite their JSON plus screenshots. Full table in [gate-catalog.md](gate-catalog.md).

Evidence binding and subset semantics: check exit code, timestamp, completion/subset markers and all applicable fingerprints. A subset PASS is never release readiness. `specFingerprint` covers the normalized spec only, but coverage also checks `sourceFingerprint` and `candidateFingerprint`: editing example source invalidates the old coverage evidence and requires a rerun. The current implementation in `tools/examples/coverage-report.cjs` governs this check; older spec-only prose in docs is historical. See [report-layers.md](report-layers.md) and [gate-catalog.md](gate-catalog.md).

Playwright prerequisites: Playwright is not a project dependency here, so browser gates resolve it through `NODE_PATH` or a `PWCLI` wrapper, and a passing `npm install` does not establish that the browser binaries are present or start. HEADLESS Jest produces no pixel evidence, and a matching GPU readback on its own is not compositor presentation evidence ([playwright-prereqs.md](playwright-prereqs.md)).

UNSUPPORTED versus FAIL: capability absence is recorded as `UNSUPPORTED` only after capability discovery has actually run and reported the gap. A launch failure, shader compile error, timeout or black-screen output is a `FAIL`, not `UNSUPPORTED` (`tools/verify/graphics-and-dom.cjs:127` catches a launch or probe throw as `status: 'FAIL'`).
