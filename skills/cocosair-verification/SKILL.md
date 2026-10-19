---
name: cocosair-verification
description: "Choose verification gates and assess browser/package evidence, write behavior and fingerprints. Use to validate changes, distinguish FAIL/UNSUPPORTED or check release readiness."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Bash
when_to_use:
  - choose focused gates for a changed contract
  - check whether a verify command writes files
  - verify package imports or actual browser behavior
  - check report fingerprints and coverage scope
  - assess release readiness without trusting stale evidence
owns: [verification-gates, evidence-layers, source-fingerprints, browser-proof, package-validation, release-readiness]
not_for:
  - package installation and setup -> cocosair-project-setup
  - live-session inspection and probes -> cocosair-agent-session
  - draw-call optimization -> cocosair-performance
layer: subsystem
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  description_zh: "选择并解释 AIR 验证门禁、写行为、指纹和逐 API 证据。用于验证改动、包消费、浏览器行为或发布候选。"
---

# AIR verification gates and evidence

Stop once you can answer the task. Do not read another same-topic reference for the same question.

Scope: Gate selection, write behavior, fresh fingerprints and scoped evidence claims.

Environment: use package imports in apps; source paths require an AIR checkout. See [context](references/context.md).

## Quick Start

For complete setup and teardown, read [Quick Start](references/quick-start.md).

Siblings: [direct dependencies](references/context.md#related-skills); reuse loaded skills.

## Triggers

- Validate source contracts without claiming rendered pixels
- Check actual default-bundle import reachability
- Verify npm consumer resolution and declarations
- Collect real browser rendering evidence
- Assess release readiness with current complete evidence
- Classify command write behavior before running it
- Distinguish UNSUPPORTED from FAIL

Exact API and symptom mappings: [triggers](references/triggers.md).

## Contracts

Run repository gates only in a source checkout. Coverage requires matching spec/source/candidate fingerprints and per-API proof. A subset, HEADLESS pass or GPU readback alone cannot establish full browser or release acceptance.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

- [HIGH] A subset PASS does not establish release readiness.
- [HIGH] Older evidence needs matching current fingerprints.
- [HIGH] Read write behavior before running a gate.
- [MEDIUM] Imports, HEADLESS and GPU readback are not presentation proof.

Read relevant [wrong/right examples](references/common-mistakes.md) before implementation.

## Reference map

- [What does this prove?](references/report-layers.md) - Claims and fingerprints
- [Will this command write?](references/gate-catalog.md) - Gate effects
- [Can browser evidence run?](references/playwright-prereqs.md) - Tools and status
