---
name: cocosair-animation-tween
description: "Animate tweens and AnimationClip tracks with one step clock. Use to loop a sequence on a target, reverseTime, clean up playback or diagnose unavailable pose graphs."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
when_to_use:
  - move or rotate a node over time
  - a clip plays once instead of looping
  - a tween will not reverse
  - track classes fail to import by name
  - step deterministic frames without a second live clock
owns: [tween, animation-clip, track-path, wrap-mode, step-clock, pose-graph-limits]
not_for:
  - glTF loading and instance setup -> cocosair-gltf
  - skeletal binding and morph weights -> cocosair-skinning-morph
  - scalar easing calculations -> cocosair-math
layer: subsystem
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  description_zh: "使用 AnimationClip、Animation 和 tween，管理播放模式、组合及单一时钟。用于动画播放、补间回收或确定性步进问题。"
---

# Cocos AIR animation and tween contracts

Stop once you can answer the task. Do not read another same-topic reference for the same question.

Scope: Tween chains, code-built clips and deterministic single-clock stepping.

Environment: use package imports in apps; source paths require an AIR checkout. See [context](references/context.md).

## Quick Start

For complete setup and teardown, read [Quick Start](references/quick-start.md).

Siblings: [direct dependencies](references/context.md#related-skills); reuse loaded skills.

## Triggers

- Move, scale or rotate over time
- Run simultaneous motions or repeating sequences
- Build or loop a keyed animation clip
- Per-frame logic with delta time
- Advance deterministic frames for evidence
- Check state-machine or pose-graph availability

Exact API and symptom mappings: [triggers](references/triggers.md).

## Contracts

Use one clock for native updates and deterministic steps. Preserve tween target ownership; pose-graph availability requires checking the actual entry. `WrapMode` is accessed through `AnimationClip.WrapMode`.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

- [HIGH] Track classes live under the animation namespace.
- [HIGH] Never run the real pacer with the step clock.
- [HIGH] Embedded reverseTime has a documented endpoint defect.
- [MEDIUM] Reassigning wrapMode resets playback; pose graphs are unpublished.

Read relevant [wrong/right examples](references/common-mistakes.md) before implementation.

## Reference map

- [Build or loop clips?](references/animation-clip.md) - Tracks and wrap modes
- [Compose motions?](references/tween-ops.md) - Chains, ownership and defects
- [Deterministic frames?](references/step-clock.md) - One clock and proof limits
