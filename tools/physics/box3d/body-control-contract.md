# Additive body controls (k candidate)

Status: implementation source, not qualified. Exact TypeScript signatures and copied fields are in `src/air/physics/box3d/binding/facade.d.mts`. ABI version remains 1; the old 29-float body snapshot is unchanged. New 49-float readback and control functions require a new schema identity. The staged core patch chain is unchanged. No original vendor byte is modified.

Every new method takes the exact owned `world, body` capabilities. C also validates both complete native IDs, matching world and unlocked state before reading or writing. Invalid output/capacity/arguments do not mutate the body or copy partial results. New setters return a freshly copied, deeply frozen `Box3DBodyState` after the actual mutation. Boolean arguments are exact booleans, including the previously defective `createBody.enableSleep` option.

## Mass and geometry

`setBodyMass(world, body, mass)` accepts positive finite float32 total mass with finite reciprocal. It does not reinterpret mass as density. The facade retains requested mass on the opaque body capability. Native code computes relative mass and center from the actual geometries/densities, then uses the parallel-axis theorem about the combined center and normalizes the inertia to total requested mass. Solids exclude sensors; when no nondegenerate solid exists, nondegenerate sensors supply an explicit `sensorMassFallback`. No geometry yields `massPending`, accepted during assembly. Before any dynamic enabled body steps, a read-only whole-world preflight rejects pending mass without advancing another body or the step counter. Static/disabled bodies may remain pending.

Shape creation/destruction, type transitions and motion locks precompute the complete new mass plan before mutation, then apply it. Deleting the last shape enters pending-invalid; restoring geometry resolves it. Shape mass changes preserve body origin pose, COM linear velocity and angular velocity, not momentum. Public `b3Body_SetMassData` changes velocity for its COM shift, so the bridge explicitly restores the previously validated velocity through the exact private state after that call. Locks zero their constrained velocity components. Changing type follows native transition rules; static/disabled bodies do not retain a hidden velocity state.

The additive box helper takes local center, half extents and unit quaternion and uses the real `b3MakeTransformedBoxHull`. Sphere center and box orientation therefore participate in COM/inertia. This is finite box/sphere qualification, not arbitrary hull/T18 qualification. Existing unbound-density foundation bodies retain old behavior unless requested mass is configured.

## Controls and readback

Native body types are 0 static, 1 kinematic, 2 dynamic, not Cocos enum numbers. Damping is the coefficient c in [0,1], yielding 1/(1+h*c) per substep. `setBodyGravityScale` reads/writes the actual scale without clearing velocity; AIR maps useGravity to 1/0. Motion factors are six exact 0/1 values in world velocity axes. Velocity setters and successful linear/angular impulses enforce them immediately before readback. A real k1 probe exposed native impulse writes deferring masking until solve; k2 narrowly masks the actual native velocity state after the impulse. Accumulated forces/torques remain real pending values until integration, not velocity changes. Legacy facade velocity/center-impulse calls use the same validation.

Forces/impulses use an offset relative to COM, as specified by the real Cocos RigidBody docs. World-space is default. Local-space rotates both the vector and the relative offset by body rotation; it does not use body origin as COM. Forces accumulate; impulses change velocity immediately. Accumulation, lever-arm torque and impulse velocity calculations must remain finite before mutation. Native maximum linear speed still applies to impulses. Dynamic enabled bodies are required for force/impulse; static/disabled velocity writes explicitly reject rather than advertise an ignored success. Kinematic velocity is real native velocity.

`clearBodyForces` clears actual accumulated force/torque, not a no-op and not impulse reversal. `clearBodyVelocity` clears the existing native velocity state without waking. `clearBodyState` does both. `setBodyAwake(false)` follows native island sleeping, not an independent-body guarantee. CCD maps native bullet state; merely setting/readback is not full CCD qualification.

## Private-layout provenance and sleep semantics

Core: erincatto/box3d `efca0c184d40fd6a82016983f1601c4d23965867`. Private bridge includes only strictly staged headers and retains no pointers across calls. The source manifest binds every original file; compiled bridge hashes bind its private access.

- `src/body.h:113-115`: actual `sleepThreshold`, `sleepTime`, `sleepVelocity`; `bodySim.force/torque` at 210-211.
- `src/solver.c:769-771`: core clears accumulators after step; 812-842 resets or advances sleep timer and applies the island sleep decision.
- `src/solver_set.c:56`: waking a sleeping solver set resets actual sleep time.
- `src/body.c:1887-1978`: SetMassData COM/velocity/inertia behavior; 2376-2448: motion-lock zeroing and automatic mass recalculation.
- `src/body.c:1591-1628`: SetType locks the world before an unsupported compound/heightfield early return; bridge rejects currently unsupported families before entering this path. This is not a removal of future T18 requirements.

`sleepy` is an observation: enabled, awake, nonstatic, world and body sleeping enabled, and actual `sleepTime > 0`. It is not speed estimation or a promise to sleep on the next tick. It is not restricted to timer <0.5 seconds because island constraints may keep a body awake longer. `sleepTime` and `sleepVelocity` remain raw last-step observations; changing threshold does not fabricate a fresh measurement. Threshold zero, kinematic, disabled/static and explicit wake behavior require actual fixtures before qualification.

## Required finite qualification

Fresh host Debug/Release and WASM Debug/Release; native locked/generation/world failures and canary readback; retained enableSleep RED inputs become no-mutation negatives; C08 box m=12 / inertia 52,40,20 and angular impulse, C09 offset spheres, sensor fallback/mixed exclusion, pending assembly/removal, force/torque/local offset analytic effects, damping grid, real sleep/wake, axis lock effects, type/enable transitions, invalid numeric/bool/enum/mass matrix inputs, 128 ID lifetimes, growth/immutable readback, current existing ownership/C21/world suites. No browser, complete T10 or G1 claim follows from these narrow tests.
