---
name: air-verification
description: Validate Cocos AIR source changes, browser behavior and package consumption without confusing subset evidence with release readiness. Use when verifying AIR modifications or interpreting AIR evidence.
---

# AIR verification

Read `docs/reference/verification.md` and the relevant tool's arguments. In the repository, consult AGENTS.md for each npm command's prerequisites, outputs and write behavior.

- Distinguish source exports, built default-bundle availability and browser behavior. Report each at the level actually verified.
- Inspect the worktree before edits or evidence-writing tools. Preserve unrelated changes and don't overwrite old attempt reports.
- Bind evidence to current source, bundle and probe fingerprints. Historical screenshots or a subset PASS cannot establish current release readiness.
- Use targeted Jest for logic/ownership and browser pixels/interaction for visual features. HEADLESS cannot validate shader output.
- An experimental browser capability missing is UNSUPPORTED only after capability discovery. Launch failure, shader failure, timeout and black output are failures, not unsupported results.
- Build commands write generated assets and advance build metadata. Evidence collectors may write screenshots and reports. `verify:release` requires a clean worktree and all applicable current evidence.
- Commit, publish and deploy only when the user authorizes those actions.
