# Actual RigidBody component-cache RED

Nine intended rollback assertions fail against the unchanged extracted component: type, mass, allowSleep, both damping values, useGravity, group, and both factor vectors. Two controls pass: current non-Box3D order and existing nonpositive mass normalization.

The test imports the real component, but explicitly injects a rejecting adapter to isolate transaction ordering. It does not create a native body, run WASM, or prove a full C36 case. The pre/post source hashes are unchanged. The next Box3D-only patch must preserve this failure history, rerun the same test and later qualify through a real initialized component and native bridge.
