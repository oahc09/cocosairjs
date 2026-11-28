# Review a runnable build

Use this when deciding whether a browser change works, not when only reviewing a code diff. The CLI is source-checkout tooling, not an installed runtime feature. It needs Node.js 22+, the local Cocos AIR dev server, its current source-bound development bundle, and Playwright Chromium from `tools/mcp` (or an executable selected with `AIR_CHROMIUM`). See the [agent review guide](../../../docs/guides/agent-review.md) for setup, commands, and limitations.

1. Define the behavior and what would falsify it before taking screenshots. Capture from the existing application rather than building a second scene just to make an assertion green.
2. Run `doctor`, then `inspect` to identify the scene, backend, and expected node. Scene IDs only have meaning with their session identity. The command uses a fresh browser each time; do not carry IDs over after reload or between commands.
3. Run `verify` in a new evidence directory for each attempt. Keep the JSON receipt and PNG together. Check the actual bundle hash, frame identity and the named assertions. If a bundle or page changed, start a fresh run; do not reuse evidence.
4. Interpret the negative control. A uniform-frame check is useful, but a nonblank image and a node name do not prove that node was drawn, that interactivity works, or that the result matches a reference. For a behavioral claim, exercise the actual control and verify state and/or the expected pixel region before and after. Report observations you could not make separately.

Keep debug tooling out of the default bundle. For a bounded interactive review, use the existing MCP session and its scoped writes and cleanup; do not add generic browser execution or publish local screenshots implicitly.

For the repository's glass-refraction fixture, prefer the localized `glass-passes` check from the guide when the question is capture versus composition. Compare the real intermediate attachment first, then confirm it is bound to the consumer and the final frame responds to the controlled material input. If readback is unavailable do not infer a captured background from the final screenshot. The pilot does not inspect arbitrary effects.

When reviewing a generated asset, separate recipe reproducibility, artifact integrity, and visible runtime effect. The seeded panel in the guide exercises all three: fresh processes reproduce the files, a changed asset is rejected before loading, and the real Viewer must show the same pixels for the same seed and different pixels for a changed seed. Do not generalize this to other assets or toolchain versions.
