# T10 initial body configuration preflight

Status: SOURCE_ONLY_MOCK_CONTROL. The source still has no successful component registration and no Box/Sphere owner. These controls are not real physics or a complete T10/T11/C36 result.

The c-red snapshot retains nine failed controls. Existing shared ownership was represented by an explicitly mocked collider reference, not an actual collider/native shape. The late non-finite angular factor case showed mass and damping had already changed before rejection. The other cases showed why validation cannot be deferred to a mocked/native delegate while earlier fields commit.

All initial fields are now copied and validated before any native write: Cocos type mapping, positive finite float32 mass with finite reciprocal, damping in [0,1], exact booleans, exact binary factors, 32-bit group and actual-system mask. IRigidBody performs that preflight before native acquisition, and shared-body attachment validates independently. Initial sheared/non-finite/degenerate transforms reject before body creation. Nonpositive initial scale is still explicitly unsupported; allowed mirrored/scale handling is not claimed complete.

The sequence of native body configuration calls is not an atomic batch. A later native failure after an earlier successful write faults the world; it is not disguised as a rollback or READY state. The public component keeps the prior cache when a setter throws, but this limited source checkpoint does not certify every native failure mode. The forthcoming facade mutation-phase contract is still required for distinguishing generic pre-write and post-write native errors.

One intervening mock expectation failed because the old mock expected double 0.2 while the new float32 preflight forwarded Math.fround(0.2). Its exact source/raw exit-1 run is retained in c-float-fixture-failure. The assertion now expects that specified float32 value, not a relaxed tolerance. The final 29 controls and earlier 34 world-control regressions are separately bound by this receipt. Actual existing-collider/invalid-RigidBody lifecycle verification remains required after real filter/shape integration.
