---
name: cocosair-verification
description: "Runs and interprets Cocos AIR verification gates without confusing subset or stale evidence with release readiness. Use when validating an AIR change, classifying a verify:* npm command as read-only or write, reading browser or package evidence, binding a report to its source and bundle fingerprints, telling UNSUPPORTED from FAIL, or preparing a release candidate that needs a clean worktree."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Bash
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  keywords: "Cocos AIR, cocosair.js, verification"
  description_en: "Runs and interprets Cocos AIR verification gates without confusing subset or stale evidence with release readiness. Use when validating an AIR change, classifying a verify:* npm command as read-only or write, reading browser or package evidence, binding a report to its source and bundle fingerprints, telling UNSUPPORTED from FAIL, or preparing a release candidate that needs a clean worktree."
  description_zh: "选择并解释 AIR 验证门禁、写行为、指纹和逐 API 证据。用于验证改动、包消费、浏览器行为或发布候选。"
---

# AIR verification gates and evidence

Use the [environment rules](references/context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Verification in this repository separates three claims that an agent tends to collapse into one: that a symbol is exported from source, that it is reachable in the built default bundle, and that it behaves correctly in a real browser. Each npm gate proves one layer, and passing a lower layer does not prove the next. Read the command's documented write behavior before running it, because several gates named `verify:*` rewrite repository content.

## Quick Start

Read [references/quick-start.md](references/quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

## Related skills

Read [references/context.md](references/context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## When to use what

- "did my source change break a contract" -> `npm run typecheck`, then `npm run verify:web-only` for the Web-only dependency boundary, then `npm test -- --runInBand` for logic and resource ownership (HEADLESS, so no pixel claims).
- "is a name reachable in the shipped default bundle" -> inspect its actual export and validate the import/bundler resolution for that entry and candidate. `verify:feature-exports` and `verify:custom-exports` are scoped structural checks, not general export-resolution proof; see [report-layers.md](references/report-layers.md).
- "will an npm consumer actually import it" -> `node tools/verify/graphics-package.cjs --out=<scratch.json>` or `npm run verify:consumer`; they pack and install offline and check real resolution and declaration consumption.
- "does it render correctly in a browser" -> the browser evidence collectors listed in [gate-catalog.md](references/gate-catalog.md); each needs Playwright tooling and matching browser binaries.
- "am I ready to release" -> `npm run verify:release`, and only after the relevant builds and evidence are current; it demands a clean worktree and aggregates existing evidence rather than recapturing it.
- "I need to know what a command does" -> read AGENTS.md's per-command table and [gate-catalog.md](references/gate-catalog.md); do not run a write gate to discover it.

## Contracts

Run repository gates only in a source checkout. Coverage requires matching spec/source/candidate fingerprints and per-API proof. A subset, HEADLESS pass or GPU readback alone cannot establish full browser or release acceptance.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](references/common-mistakes.md):

- [HIGH] Calling a change release-ready from a subset PASS
- [HIGH] Treating an older round's evidence as current
- [HIGH] Running a write gate just to learn what it does
- [MEDIUM] Reading a green import, a HEADLESS pass, or a readback as browser proof

## References

- [report-layers.md](references/report-layers.md) - the three report layers, claimed versus verified, the coverage `--check` chain, and what each layer can and cannot prove.
- [gate-catalog.md](references/gate-catalog.md) - the read-only versus write classification for every `verify:*` gate, with each write gate's output path and clean-worktree requirements.
- [playwright-prereqs.md](references/playwright-prereqs.md) - Playwright resolution, browser-binary availability, the presentation-evidence rule, and UNSUPPORTED versus FAIL semantics.

## Canonical docs

- `docs/reference/verification.md` - open for the command groups, the historical-evidence warning, and the release gate's fingerprint and clean-worktree requirements.
- `docs/reference/example-specification.md` - open for the claimed versus verified separation, specFingerprint scope, and the declared-versus-executed consistency rule.
- `AGENTS.md` - the authoritative per-command table of prerequisites, outputs and write behavior; classify every gate against it before running it.
