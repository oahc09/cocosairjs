Derived from the cocosair-verification skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

# Common Mistakes

### [HIGH] Calling a change release-ready from a subset PASS

Wrong:

```bash
npm run verify:browser-matrix -- --browser=chromium   # one engine, subset run
npm run verify:release                                # then claims READY from that run
```

The matrix run above is a single-engine subset; its report carries a subset marker and an incomplete pass count, so `verify:release` still fails the `runPass === runTotal` and `subset === false` checks (`tools/verify/release-readiness.cjs:149`). A subset, a Gallery built with `COCOSAIR_GALLERY_EXAMPLES`, or one passing example never establishes release readiness. See [report-layers.md](report-layers.md).

### [HIGH] Treating an older round's evidence as current

Wrong:

```bash
ls -l docs/evidence/ | grep perf-lifecycle   # "the file is here, so perf is verified"
```

The file's existence says nothing about this run. `verify:perf-lifecycle` and every browser collector only rewrite their report when they actually execute, so a stale file from a prior candidate still sits on disk. Read the report's timestamp, its recorded source, bundle and contract fingerprints, and its completion marker, and require the exit code of the run that produced it. Evidence from an older revision is historical, not current proof. See [gate-catalog.md](gate-catalog.md).

### [HIGH] Running a write gate just to learn what it does

Wrong:

```bash
npm run verify:api-coverage   # "just to see the output"
```

That command rewrites `api-coverage-report.json` under `docs/`, and `verify:v06-gate`, `verify:browser-matrix`, `verify:tarball-consumer`, `verify:perf-lifecycle` and `verify:g3-dev` rewrite their JSON and screenshot artifacts in the shared worktree. To learn a command's behavior, read the AGENTS.md table and [gate-catalog.md](gate-catalog.md) instead of mutating repo evidence. If a gate must run, check the worktree first and expect its documented writes.

### [MEDIUM] Reading a green import, a HEADLESS pass, or a readback as browser proof

Wrong:

```bash
npm test -- --runInBand   # then: "the shader renders correctly"
```

`npm test` is jsdom plus HEADLESS and validates logic, not GPU output; `verify:feature-exports` checks scoped feature/export declarations and finite bundle symbol texts, not arbitrary export resolution or drawing; and a matching GPU readback alone is not compositor presentation evidence. Visual features need a real browser gate. Equally, do not report `UNSUPPORTED` because a probe timed out or produced a black frame - that is a `FAIL`. See [playwright-prereqs.md](playwright-prereqs.md).
