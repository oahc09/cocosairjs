---
name: cocosair-verification
description: Runs and interprets Cocos AIR verification gates without confusing subset or stale evidence with release readiness. Use when validating an AIR change, classifying a verify:* npm command as read-only or write, reading browser or package evidence, binding a report to its source and bundle fingerprints, telling UNSUPPORTED from FAIL, or preparing a release candidate that needs a clean worktree.
---

# AIR verification gates and evidence

Verification in this repository separates three claims that an agent tends to collapse into one: that a symbol is exported from source, that it is reachable in the built default bundle, and that it behaves correctly in a real browser. Each npm gate proves one layer, and passing a lower layer does not prove the next. Read the command's documented write behavior before running it, because several gates named `verify:*` rewrite repository content.

## Quick Start

Start with read-only gates that print a result and an exit code but do not touch canonical evidence in the repo.

```bash
npm run typecheck
npm run verify:web-only
npm run verify:doc-refs
npm run verify:feature-exports
npm run verify:release
```

`typecheck`, `verify:web-only`, `verify:doc-refs` and `verify:feature-exports` emit terminal diagnostics plus an exit code only. `verify:release` recomputes the candidate fingerprint and prints `READY` or `NOT READY` with blockers; it reads existing evidence and rebuilds nothing. A package-consumer check can be pointed at a scratch path so it does not overwrite canonical reports:

```bash
node tools/verify/graphics-package.cjs --out=output/graphics-package.json
```

That collector runs `npm pack`, installs the tarball offline under `output/`, and writes only the requested `--out` JSON; it is heavier than the static gates above and needs a working npm CLI and a current bundle.

## Related skills

- [cocosair](../cocosair/SKILL.md) - the router and Code First discipline; load it first.
- [cocosair-application](../cocosair-application/SKILL.md) - `createAirApp` and bootstrap startup; its build artifacts are what the reachability layer inspects.
- [cocosair-project-setup](../cocosair-project-setup/SKILL.md) - which entry and `AIR_FEATURES` variant produced the bundle a gate is reading.
- [cocosair-performance](../cocosair-performance/SKILL.md) - the two performance collectors and their evidence boundaries.

## When to use what

- "did my source change break a contract" -> `npm run typecheck`, then `npm run verify:web-only` for the Web-only dependency boundary, then `npm test -- --runInBand` for logic and resource ownership (HEADLESS, so no pixel claims).
- "is a name reachable in the shipped default bundle" -> `npm run verify:feature-exports` and `npm run verify:custom-exports`; these reconcile capability names, feature units and aggregate exports against the bundle, not browser pixels.
- "will an npm consumer actually import it" -> `node tools/verify/graphics-package.cjs --out=<scratch.json>` or `npm run verify:consumer`; they pack and install offline and check real resolution and declaration consumption.
- "does it render correctly in a browser" -> the browser evidence collectors listed in `references/gate-catalog.md`; each needs Playwright tooling and matching browser binaries.
- "am I ready to release" -> `npm run verify:release`, and only after the relevant builds and evidence are current; it demands a clean worktree and aggregates existing evidence rather than recapturing it.
- "I need to know what a command does" -> read AGENTS.md's per-command table and `references/gate-catalog.md`; do not run a write gate to discover it.

## Contracts

Three report layers, and each layer is independent evidence (`docs/reference/verification.md`):

1. Source-export claim. A symbol appears in the export surface and the API inventory. Coverage reports call this `claimed`. A typecheck or a declaration build establishes at most this.
2. Default-bundle reachability. The name resolves in the built `cocosair.module.js` for the default feature set, gated by `verify:feature-exports` and `verify:custom-exports`. A successful bundle plus a Node import does not establish visual correctness.
3. Real-browser behavior. A running page passes scene, pixel, interaction and lifecycle assertions in Chromium, Firefox or WebKit. Coverage reports count a claim `verified` only when the owning example PASSes in the browser matrix or the DevTools session gate AND the evidence fingerprint matches the current spec.

Write gates versus read-only gates:

- Read-only (terminal output plus exit code, no canonical repo writes): `verify:web-only`, `verify:file-map`, `verify:licenses`, `verify:doc-refs`, `verify:wasm-backends`, `verify:custom-exports`, `verify:feature-exports`, `verify:example-chain`, `verify:port-evidence` (with `--selftest`), `verify:release`. `verify:doc-refs` writes a report only with an explicit output option; `verify:release` needs a clean Git worktree (see `references/gate-catalog.md`).
- Write gates (rewrite repository content despite the `verify` name): `verify:api-coverage` rewrites `api-coverage-report.json` under `docs/`; `verify:v06-gate` rewrites the `v06-review-gate.json` under `docs/evidence/` and `v06-final-gate.md` under `build/reports/`; and the browser evidence collectors `verify:browser-matrix`, `verify:perf-lifecycle`, `verify:tarball-consumer` and `verify:g3-dev` each rewrite their JSON plus screenshots. Full table in `references/gate-catalog.md`.

Evidence binding and subset semantics: a report file existing does not prove the current run succeeded. Check the exit code, the run timestamp, the completion and subset markers, and the source, bundle and contract fingerprints recorded in the report. `COCOSAIR_GALLERY_EXAMPLES` marks a Gallery artifact as a subset; the release gate rejects a browser matrix whose `subset` flag is true or whose `runPass` does not equal `runTotal` (`tools/verify/release-readiness.cjs:149`). A subset PASS is never release readiness. `specFingerprint` covers only `example.json`, so an example source edit does not invalidate prior evidence and needs a manual rerun to refresh it (`docs/reference/example-specification.md`).

Playwright prerequisites: Playwright is not a project dependency here, so browser gates resolve it through `NODE_PATH` or a `PWCLI` wrapper, and a passing `npm install` does not establish that the browser binaries are present or start. HEADLESS Jest produces no pixel evidence, and a matching GPU readback on its own is not compositor presentation evidence (`references/playwright-prereqs.md`).

UNSUPPORTED versus FAIL: capability absence is recorded as `UNSUPPORTED` only after capability discovery has actually run and reported the gap. A launch failure, shader compile error, timeout or black-screen output is a `FAIL`, not `UNSUPPORTED` (`tools/verify/graphics-and-dom.cjs:127` catches a launch or probe throw as `status: 'FAIL'`).

## Common Mistakes

### [HIGH] Calling a change release-ready from a subset PASS

Wrong:
```bash
npm run verify:browser-matrix -- --browser=chromium   # one engine, subset run
npm run verify:release                                # then claims READY from that run
```

The matrix run above is a single-engine subset; its report carries a subset marker and an incomplete pass count, so `verify:release` still fails the `runPass === runTotal` and `subset === false` checks (`tools/verify/release-readiness.cjs:149`). A subset, a Gallery built with `COCOSAIR_GALLERY_EXAMPLES`, or one passing example never establishes release readiness. See `references/report-layers.md`.

### [HIGH] Treating an older round's evidence as current

Wrong:
```bash
ls -l docs/evidence/ | grep perf-lifecycle   # "the file is here, so perf is verified"
```

The file's existence says nothing about this run. `verify:perf-lifecycle` and every browser collector only rewrite their report when they actually execute, so a stale file from a prior candidate still sits on disk. Read the report's timestamp, its recorded source, bundle and contract fingerprints, and its completion marker, and require the exit code of the run that produced it. Evidence from an older revision is historical, not current proof. See `references/gate-catalog.md`.

### [HIGH] Running a write gate just to learn what it does

Wrong:
```bash
npm run verify:api-coverage   # "just to see the output"
```

That command rewrites `api-coverage-report.json` under `docs/`, and `verify:v06-gate`, `verify:browser-matrix`, `verify:tarball-consumer`, `verify:perf-lifecycle` and `verify:g3-dev` rewrite their JSON and screenshot artifacts in the shared worktree. To learn a command's behavior, read the AGENTS.md table and `references/gate-catalog.md` instead of mutating repo evidence. If a gate must run, check the worktree first and expect its documented writes.

### [MEDIUM] Reading a green import, a HEADLESS pass, or a readback as browser proof

Wrong:
```bash
npm test -- --runInBand   # then: "the shader renders correctly"
```

`npm test` is jsdom plus HEADLESS and validates logic, not GPU output; `verify:feature-exports` proves a name is in the bundle, not that it draws correctly; and a matching GPU readback alone is not compositor presentation evidence. Visual features need a real browser gate. Equally, do not report `UNSUPPORTED` because a probe timed out or produced a black frame - that is a `FAIL`. See `references/playwright-prereqs.md`.

## References

- `references/report-layers.md` - the three report layers, claimed versus verified, the coverage `--check` chain, and what each layer can and cannot prove.
- `references/gate-catalog.md` - the read-only versus write classification for every `verify:*` gate, with each write gate's output path and clean-worktree requirements.
- `references/playwright-prereqs.md` - Playwright resolution, browser-binary availability, the presentation-evidence rule, and UNSUPPORTED versus FAIL semantics.

## Canonical docs

- `docs/reference/verification.md` - open for the command groups, the historical-evidence warning, and the release gate's fingerprint and clean-worktree requirements.
- `docs/reference/example-specification.md` - open for the claimed versus verified separation, specFingerprint scope, and the declared-versus-executed consistency rule.
- `AGENTS.md` - the authoritative per-command table of prerequisites, outputs and write behavior; classify every gate against it before running it.
