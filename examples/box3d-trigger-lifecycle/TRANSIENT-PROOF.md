# Thin-path diagnostic qualification (CPU/source only)

**New source candidate; browser/native execution NOT_RUN. No CCD PASS.**
The sealed `3b362b254a9c38ae18815e1faa1b0d7d0542c9e9` evidence remains a 30 m/s experiment.
Its fast-solid and moving-sensor observations must not be relabelled as 120 m/s or pure transient detection.

## 1. Why the original path was confounded

The centered sphere radius is .15 m; the axis-aligned box size is .01×1×.8 m. Both centers move along x,
y=z=0. With float32 native geometry, projected intersection is possible when

```
r32 = f32(.15) = .15000000596046448
b32 = f32(.01 / 2) = .004999999888241291
extent = r32 + b32 = .15500000584870577
width = 2 * extent = .31000001169741154
D = f32(1/60) = .01666666753590107
h = f32(D/4) = .004166666883975267
```

At 30 m/s, `f32(h*30)=.125`. Original x₀=-2 gives substep endpoints 15/16/17 at -.125/0/.125.
Substep 16 is the fourth full tick, so an observed enter can coincide with discrete endpoint overlap.
Moving-sensor target rounding produces tiny differences but does not remove that overlap. The old actual
exports already show x≈0 at tick four. Their event counts are observations, not transient-CCD proof.

Shifting x₀ to -2.25 at unchanged 30 m/s removes full-tick endpoint overlap (nearest ±.25), but substeps
17/18/19 still overlap. More generally, an interval .3100000117 m wide cannot fit strictly between
uniform endpoints spaced .125 m apart during a complete crossing. Therefore **no starting phase alone
can exclude all substep endpoint overlap at 30 m/s with this geometry and four subdivisions**.

The original two 30 m/s modes and x₀=-2 remain available unchanged as explicitly confounded baselines.

## 2. Separately named 120 m/s diagnostic

`fast-solid-transient120` and `moving-sensor-transient120` are **new controlled conditions**, not a repair
of the old evidence. They retain geometry, four solver subdivisions, D, 24 ticks and all zero-force setup,
but explicitly select speed=120 m/s and x₀=-8.25 m. The stationary counterpart remains at x=0.

### Dynamic solid free-motion model

`f32(h*120)=.5` exactly. All 97 endpoints (initial plus 96 substep endpoints) are
`xₙ=-8.25+.5*n`, n=0…96. Closest endpoints are -.25 at n=16 and +.25 at n=17.
All full-tick endpoints are the n divisible by four subset. Thus

```
minimum center separation = .25
minimum projected clearance = .25 - extent = .09499999415129423 > 0
full tick 4 -> 5: -.25 -> 1.75 (crossing occurs between endpoints)
```

Simply selecting 120 without the phase shift is not sufficient: x₀=-8 gives x₁₆=0. CPU tests retain
this and both 30 m/s paths as negative controls; no speed or contact threshold is tuned after observing a hit.

### Kinematic target rounding model

Do not assume the target's actual velocity is exactly 120. The source-derived float32 recurrence is:

```
target[t] = f32(-8.25 + t * 120 * D)          # public target command / float32 wire
invD = f32(1 / D) = 59.999996185302734
v[t] = f32(invD * f32(target[t] - x[t-1]))   # native SetTargetTransform
localDelta = 0
repeat four times:
  localDelta = f32(localDelta + f32(h * v[t]))
  substepPosition = f32(x[t-1] + localDelta)
x[t] = f32(x[t-1] + localDelta)
```

Enumerating all 97 endpoints yields minimum center separation **.2499995231628418**, at substep 16,
with clearance **.09499951731413603 > 0**. Substep 17 is .2500004768371582. Across 24 ticks velocities
range **119.99999237060547…120.00010681152344**. Every predicted full-tick and substep endpoint is separate.
This recurrence is a CPU source model, not a readout of hidden native substeps.

## 3. Source qualifications and limits

The reference is SDK223 producer `b089d223aad1bb4be4a81f187eceb341510d766a`, frozen Box3D core
`efca0c184d40fd6a82016983f1601c4d23965867`. Do not substitute current unqualified native ABI sources.
Source files read (not executed/modified) for this derivation:

- `tools/physics/box3d/native/air_box3d.c:17–28`: rejects DOUBLE_PRECISION and FAST_MATH; requires float32 position ABI.
- `vendor/box3d/core/src/physics_world.c:1113`: h=timeStep/subStepCount.
- `vendor/box3d/core/include/box3d/math_functions.h:332`: `b3MulAdd` is a+s*b; local position uses float arithmetic.
- `vendor/box3d/core/src/solver.c:89–104,178–217`: damping/force integration, speed cap, then local delta integration.
- `vendor/box3d/core/src/body.c:1311–1314`: target center difference and float reciprocal timestep produce velocity.
- `tools/physics/box3d/native/command_bridge.c:228`: accepted target command uses `b3Body_SetTargetTransform`.
- `tools/physics/box3d/native/world_bridge.c:210`: starts from default world definition without changing speed cap.
- `vendor/box3d/core/src/types.c:26`, `core.c:42`: maximum speed 400×lengthUnits, default lengthUnits=1.
  This is source evidence, not a public runtime cap getter; the actual velocity trace must still show no clamp.
- `vendor/box3d/core/src/solver.c:363,418`: limited fast-solid→sensor path requires native sensor-event flags and
  stores native continuous hits. `:548` skips continuous detection when the moving shape itself is a sensor.
  These branches are context, not a predeclared outcome; capture actual native callbacks for both new modes.

Required scene assumptions: no gravity, zero linear/angular damping, zero applied force/torque, zero angular
velocity, identity rotations, unit scale, centered primitive colliders, unchanged filter/enabled/trigger flags,
no blocking entity or command perturbation, and no speed cap. The example uses only velocity or the public
kinematic target, never runtime teleport. Door occupies z≈[-1.4,-1.2], other zones z≈[-2.4,-1.6]; the tested
sphere reaches |z|≤.15 and moving sensor |z|≤.4. They are separated from those other entities throughout
straight x motion. Their spawn/door callbacks are not entered by this lane. Unexpected query peers invalidate
qualification rather than silently ignoring a blocker.

## 4. Actual-run evidence requirements (NOT_RUN)

Each before-step and after-physics observation now retains **both** bodies' public pose, velocity, local COM,
angular velocity, CCD getter, collider geometry, node scale and configuration. A same-context zero-translation
committed query with both colliders additionally copies their public committed geometry. Its stamp must match
the real moving-source sweep (world/tick/attempt/native step/mutation revision). No query becomes an event.

The before-step observation now participates in qualification, rather than being merely saved. Every tick
checks both bodies against the **previous** model endpoint, including the initial x₀ before tick one; checks
public primitive geometry/centers/unit scale, component body type, damping/gravity/filter/CCD flags and axes/rotation;
checks native `Box3DBodyMotion.enabled===true`, `massPending===false` and native type (0 static/1 kinematic/2 dynamic)
before AND after, rather than confusing that enum with component ERigidBodyType or assuming readiness;
and verifies both committed pair children AND the sweep source child's identity, origin, rotation and
exact dimensions against those same copied public body poses. Query completeness, application generation,
hook tick/attempt and all native epoch fields must agree. Missing fields fail closed.

The frozen `world.ts:1002/1029` and `world-command-owner.ts:886` order is hook collection BEFORE native
command-batch application. Thus moving-sensor before velocity is the **previous committed tick's velocity**,
zero initially; after velocity is the newly applied target velocity. The qualifiers explicitly distinguish
these phases. A wrong initial pose/config cannot qualify by returning to the expected post-step endpoint.

The after-step result conjoins the matching before-step result (same generation/tick/attempt/step), the
post-step checks, and a latched `priorTicksQualified` flag. Any earlier mismatch keeps later results
INCONCLUSIVE for that run, even if motion subsequently rejoins the model. Reset/new run starts a new latch.
The dynamic CPU model also uses the core's local-delta-per-tick recurrence (not a generally equivalent
global-position rounding shortcut); the fixed 30/120 dyadic predictions and clearances are unchanged.

The diagnostic compares actual post-step x/velocity to the appropriate exact source model, checks static
counterpart, axes/rotation/center, geometry, damping/gravity/filter/CCD configuration and unexpected peers.
There is **no widened tolerance**. Missing data or any mismatch yields `INCONCLUSIVE`; retain it, investigate
and do not relax thresholds just to qualify a result. `MATCHES_SOURCE_MODEL` means only that the recorded
endpoint conditions match, **not native CCD PASS or directly observed substeps**. Full 24/24 qualification,
positive actual endpoint clearances and complete source assumptions are prerequisites to interpretation.

Capture native enter/stay/exit separately, including timing association and retired-object rejection. A
fast-solid transient enter, if present, must not be dropped merely because endpoints are outside. Review
actual exit timing and any stay against C22; do not manufacture expected outcomes. The moving-sensor mode
is a boundary observation, not a promised-hit path. Positive or negative native outcomes remain reportable.
C22's lower-level native evidence and the full C28 flags/occlusion/capacity matrix remain separate work.

The crossing region stays in the existing camera view; distant initial/final 120 m/s positions can leave it.
Exports, not a rendered screenshot alone, establish body endpoints. No visual-render acceptance is claimed.

## 5. Original lifecycle control-window presets

Visible **New run · in-zone Mask / Disable / Trigger round trip** buttons start the original 1 m/s,
1×1×.8 m-zone, r=.15, 480-tick lifecycle scene. They are fixed named sequences, not an arbitrary script API.
One actual accepted count-zone enter for this generation/self/other anchors actions at hook tick +2/+4.
At idle, Mask becomes 0 and restores its original getter value; Enabled/Trigger become false then restore
true. Manual conflicting controls/Start/preset buttons are disabled while armed/anchored; Reset/Close remain.

Each applied action records request tick, due tick, actual idle hook tick, generation, before/after getter,
both current body observations and sphere/box intersection reconstructed from actual pose/geometry. Missed
or delayed ticks, wrong generation or retired actor cancel rather than replaying late. Reset/Close/fault/
retirement cancel pending actions; re-entry never rearms. Trigger→solid may genuinely deflect/stop the sphere:
restore-time intersection is measured and **no new enter is promised or synthesized**. These presets improve
observability only; native transition correctness still requires fresh execution and raw event review.
