# Shared material values decisions, version 1

Status: lead implementation decisions, not implementation or acceptance. Applies only to the observed Box3D path. The source analysis is tools/verify/box3d/shared-material-plan-20261022-a/README.md, frozen against source checkpoint 35 (9df645b4a84e73c86ffd460b59cbd6e2ab732cbb). No native C/ABI/facade or frozen N4 input change is required by this plan.

Adopt design D1–D4:

1. Physical coefficient propagation uses a private owner/binding-generation lane. It completes before the single original public EVENT_UPDATE notification. Public off/removeAll/targetOff/clear only change public notifications; public/manual emit cannot obtain physics propagation authority. No hidden Box3D physics listener may remain in the public table and cause duplicate effects. Unobserved material/other backend paths retain their original behavior.
2. Preserve original scalar math.equals and setValues exact comparison semantics, after earliest owned admission and strict Box3D validation. Copy actual private caches, not overridden asset getters. The public setValues argument order differs from the canonical copied tuple and must be explicitly reordered.
3. Refuse destroy of an asset with live/provisional/unresolved physical ownership before object flags or the deferred queue change. Release exact bindings first; do not silently detach colliders or substitute a default material.
4. Open and prepare all participating owners/shapes before any cache or native effect. A native setter entered then throwing is unknown; a normal return is committed; readback is a separate fact. Fault all affected participants after any effect failure, preserve falsy first failures and independently release scopes. Never rollback/replay or claim whole-world atomicity.

Current implementation scope starts with the complete Box3D-owned roster. Foreign/stale owners refuse before effects. The singleton System/selector architecture is not relaxed to claim multiple simultaneous active worlds. Mixed-backend binding completeness needs a neutral actual-binding ledger; until it exists, full all-owner qualification and unified consumer activation remain blocked. Public subscription counts are never ownership proof.

The private primitive, actual kernel preparation, five asset entries and actual identity/lifetime wiring are separate review stages. A pure mock control cannot qualify actual World/WASM. All 2,128 formal cells remain NOT_RUN and all nine Gates remain unpassed.
