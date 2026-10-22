# Actual Collider setter transaction checkpoint

Status: ACTUAL_COMPONENT_CONTROL_ONLY. Delegates are explicit injected mocks. No native shape, WASM, full C36, T10, browser or public-feature qualification.

The retained red run imported the actual BoxCollider, SphereCollider, Collider, PhysicsMaterial and selector sources in the existing Node/JSDOM Jest realm. It exited 1 with 16 failed and 7 passed assertions, demonstrating cache/listener changes before delegate validation and zero-argument size callbacks. The exact pre-edit sources and raw stdout/stderr remain under the sibling red directory.

Only three extracted files change: collider.ts, box-collider.ts and sphere-collider.ts. Box3D trigger/center/material setters delegate before committing caches or listener replacement. Box/Sphere delegate normalized candidate dimensions before cache commit, using optional-argument intersection types without changing shared interfaces or other backend implementations. Existing no-shape normalization and builtin/Cannon zero-argument cache-first paths remain unchanged. Whole extracted files were not reformatted; the focused insertions retain upstream formatting and copyright.

The green suite has 25 controls, including accepted/rejected transactions, unchanged builtin/Cannon paths and explicit limitations. An unexpected material.on failure after successful native delegation is not a full rollback: the old listener may already be detached. Ordinary EventTarget listener registration is assumed nonthrowing. Material EVENT_UPDATE occurs after asset mutation, and direct Vec3 alias writes bypass these property setters. Those boundaries remain unqualified; no complete C36 claim is made. Initial serialized/shared-material listener adoption is not established by this setter-only suite.

The existing console warning about an absent game container is retained in raw stdout. This source harness does not create a browser or render output. Receipts bind exact before/after hashes for the integrator's upstream map/UPSTREAM/allowlist update; those shared metadata files were not edited here.
