# Box3D experimental single-threaded backend

Box3D is an explicitly selected Web WASM/SIMD backend. The normal runtime keeps
builtin/Cannon and does not download Box3D assets. Source integration is available;
the complete original physics, lifecycle, browser/device and performance matrix is
still open. See the [integration ledger](../physics/box3d/integration-20261031.md)
and [original scope](../../ai/plans/box3d-v1.2-reference.md).

## Build a matching runtime and native asset set

Use the official Emscripten **6.0.2** release locked in
`tools/physics/box3d/versions.lock.json`. Keep its environment local to the current
shell. On Windows, select the SDK with `EMSDK`, its Python with `EMSDK_PYTHON`, and
its embedded configuration with `EM_CONFIG`; make the SDK's `mingw32-make` available
on `PATH` for the existing audited CMake Makefiles route. Do not replace the locked
core, patches or compiler to work around a failure.

The commands below use PowerShell. Choose new output directories for every
attempt: the native builder and audit preserve existing results and reject reuse.

```powershell
node tools/physics/box3d/verify-sources.mjs
node --test tools/verify/box3d/source-staging.test.mjs

$nativeOutput = 'tools/physics/box3d/output/local-st'
node tools/physics/box3d/build.mjs --out $nativeOutput
if ($LASTEXITCODE -ne 0) { throw 'Box3D native build failed; retain this attempt.' }
node tools/physics/box3d/audit-artifacts.mjs $nativeOutput
if ($LASTEXITCODE -ne 0) { throw 'Box3D artifact audit failed; retain this attempt.' }

$env:AIR_FEATURES = node -e "console.log([...require('./tools/build/default-features.cjs').DEFAULT_FEATURES,'physics-box3d'].join(','))"
$env:AIR_BOX3D_ST_BUILD_DIR = (Resolve-Path $nativeOutput).Path
$env:AIR_OUT_DIR = Join-Path (Get-Location) 'build-box3d'
node tools/build/build.cjs --format esm
if ($LASTEXITCODE -ne 0) { throw 'Box3D runtime build failed.' }
```

The runtime build performs the native consumption gate and stages the matching
assets under `build-box3d/physics/box3d/st/`. Ship that complete directory beside
`build-box3d/cocosair.module.js`. An old WASM or a manifest from another build is
not a valid replacement. This optional output is separate from the default npm
distribution; it does not make Box3D part of the normal package.

For current focused unit/asset checks after a successful audited native build:

```powershell
node tools/verify/box3d/integration-20261031/verify-current.cjs $nativeOutput
```

This runner does not certify original Gates or browser rendering. Declaration
generation is a separate `node tools/build/build-dts.cjs` operation and always
uses the default `build/` directory; `AIR_OUT_DIR` does not redirect declarations.
Runtime JS builds consume a build number. Preserve their logs and exact identities.

After generating declarations, check the public Box3D configuration, hook, copied
motion and close-receipt types in ESNext and Node16 consumers with `skipLibCheck=false`:

```powershell
node tools/verify/box3d/public-sdk-types.cjs --dts build/cocosair.module.d.ts
```

This command reads the selected declarations without rebuilding them. Type success
does not qualify native physics or browser execution.

## Select Box3D before engine initialization

```ts
import { createAirApp } from './cocosair.module.js';

const app = await createAirApp({
    canvas: '#GameCanvas',
    physics: 'box3d',
    physicsOptions: {
        box3d: {
            assetBaseUrl: new URL('./physics/box3d/st/', import.meta.url).href,
            threading: 'single',
            workerCount: 1,
            solverSubSteps: 4,
        },
    },
});
```

Use the original Cocos `Node`, `RigidBody`, collider, constraint and `PhysicsSystem`
APIs. There is one engine-owned physics clock. `solverSubSteps` subdivides a fixed
tick; it is not `PhysicsSystem.maxSubSteps` or another application update loop.

Live changes must use supported body/constraint APIs and the admitted engine
phases. Do not move a simulated body by writing its Node transform. The public
`registerBox3DBeforeStep`, `readBox3DBodyMotion` and `readBox3DConstraintState` APIs
provide controlled submission and copied observations without exposing handles.
Before-step callbacks are synchronous and must return `undefined`.

## Implemented surfaces and restrictions

| Surface                | Current boundary                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| Rigid bodies           | Static, kinematic and dynamic component adapters; compound shapes and controlled mutations                   |
| Primitive colliders    | Box, Sphere and Capsule                                                                                      |
| Convex geometry        | MeshCollider convex hull; Cylinder/Cone use generated 32-segment convex hull geometry                        |
| Concave mesh / terrain | Static geometry only; their public collision/trigger listener paths reject                                   |
| Constraints            | PointToPoint, Hinge and Fixed adapters; not unrestricted compatibility with other backends                   |
| Queries                | Raycast and Box/Sphere/Capsule sweeps, plus copied committed query APIs; geometric/phase restrictions remain |
| Public events          | Qualified geometry families are restricted to Box/Sphere/Capsule participants                                |
| Threading              | Single thread only; `multi` and `auto` reject before asset loading                                           |

Character controllers, full configurable/D6 constraints, Plane and Simplex have
explicit unsupported component constructors. Rolling/spinning friction, dynamic
concave meshes and unsupported transform changes also reject. These refusals do
not count as implementation of those features.

## Failure and lifecycle handling

- A default runtime cannot start Box3D merely by setting `physics: 'box3d'`; build
  the explicit feature and its matching assets first.
- Asset base URLs must resolve to HTTP(S) directories without credentials, query
  parameters or fragments. The loader checks the trusted manifest and asset hashes.
- Keep original errors and cleanup receipts. A retained resource or failed close
  cannot be reclassified as successful just because another counter reaches zero.
- Release scenes and close through the application lifecycle. Close is terminal;
  another app requires a page reload under the existing AIR admission contract.

The five current examples are the rigid-body playground, compound bowling, CCD
range, trigger lifecycle and gift workshop. Their source presence does not establish
complete example acceptance. The gift workshop's default view is diagnostic; its
frozen candidate selectors require their exact locked runtime and qualification.
Do not rewrite a historical candidate lock to admit a newer SDK.

The frozen v1 acceptance denominator remains recoverable through the
[historical input archive](../physics/box3d/contracts/archive/README.md). Historical
PASS records and the existence of reports never substitute for current execution.
