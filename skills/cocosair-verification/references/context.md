# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
- [cocosair-application](../../cocosair-application/SKILL.md) - `createAirApp` and bootstrap startup; its build artifacts are what the reachability layer inspects.
- [cocosair-project-setup](../../cocosair-project-setup/SKILL.md) - which entry and `AIR_FEATURES` variant produced the bundle a gate is reading.
- [cocosair-performance](../../cocosair-performance/SKILL.md) - the two performance collectors and their evidence boundaries.

## Original entry guidance

The original entry wording below is an on-demand archive, not a second routing source.

Use the [environment rules](context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Verification in this repository separates three claims that an agent tends to collapse into one: that a symbol is exported from source, that it is reachable in the built default bundle, and that it behaves correctly in a real browser. Each npm gate proves one layer, and passing a lower layer does not prove the next. Read the command's documented write behavior before running it, because several gates named `verify:*` rewrite repository content.

Read [references/quick-start.md](quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

Read [references/context.md](context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## Original mistake navigation

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](common-mistakes.md):

- [HIGH] Calling a change release-ready from a subset PASS
- [HIGH] Treating an older round's evidence as current
- [HIGH] Running a write gate just to learn what it does
- [MEDIUM] Reading a green import, a HEADLESS pass, or a readback as browser proof

## Original metadata

### Description and description_en

The two original fields contained exactly the same value, retained once here.

Runs and interprets Cocos AIR verification gates without confusing subset or stale evidence with release readiness. Use when validating an AIR change, classifying a verify:* npm command as read-only or write, reading browser or package evidence, binding a report to its source and bundle fingerprints, telling UNSUPPORTED from FAIL, or preparing a release candidate that needs a clean worktree.

### Keywords

Cocos AIR, cocosair.js, verification

## References

- [report-layers.md](report-layers.md) - the three report layers, claimed versus verified, the coverage `--check` chain, and what each layer can and cannot prove.
- [gate-catalog.md](gate-catalog.md) - the read-only versus write classification for every `verify:*` gate, with each write gate's output path and clean-worktree requirements.
- [playwright-prereqs.md](playwright-prereqs.md) - Playwright resolution, browser-binary availability, the presentation-evidence rule, and UNSUPPORTED versus FAIL semantics.

## Canonical docs

- `docs/reference/verification.md` - open for the command groups, the historical-evidence warning, and the release gate's fingerprint and clean-worktree requirements.
- `docs/reference/example-specification.md` - open for the claimed versus verified separation, specFingerprint scope, and the declared-versus-executed consistency rule.
- `AGENTS.md` - the authoritative per-command table of prerequisites, outputs and write behavior; classify every gate against it before running it.
