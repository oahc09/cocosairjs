# Request, instance and material recipe

This recipe uses the existing native scene and ownership APIs; it does not introduce another resource manager. The [draft inspection example](../../examples/material-inspection-showroom/src/showroom.ts) expands it into three independent rigs, twelve swatches, single-capture transmission and two ordinary offscreen previews. Its browser acceptance is still pending.

## Cancellable local model and owned material

```ts
import { GLTFLoader, MeshRenderer, Vec4 } from 'cocosair';

// app has already run the native scene. Reuse that exact app and runtime.
if (!app.session) throw new Error('This recipe requires the published session contract');
const scope = app.session;
const token = scope.token();
const controller = new AbortController();
const unregisterRequest = scope.own(() => controller.abort(), 'model-request');
let asset;
try {
    asset = await new GLTFLoader({
        signal: controller.signal,
        request: { priority: 'high', httpCache: 'no-store', credentials: 'same-origin' },
    }).loadAsync('/assets/model.gltf');
} finally {
    unregisterRequest();
}
if (!token.isCurrent() || controller.signal.aborted) {
    asset.destroy();
    throw new DOMException('Stale scene generation', 'AbortError');
}
asset.addRef();
const instance = asset.instantiate();
scene.addChild(instance.root);
scope.own(() => {
    instance.dispose();
    asset.destroy();
    asset.decRef(false);
}, 'model-instance-and-asset');
const renderer = instance.root.getComponentsInChildren(MeshRenderer)[0];
const material = renderer?.getMaterialInstance(0);
if (!material) throw new Error('Expected a renderable material');
// Only for an asset whose material declares KHR_materials_iridescence:
material.setProperty('airIridescence', new Vec4(0.7, 2.5, 100, 400));
// controller.abort() cancels an in-flight request; create a NEW controller for retry.
```

Use `getMaterialInstance`, not mutation of a shared glTF template. For user inputs, validate finite film IOR >= 1 and nonnegative ordered min/max thickness in nanometers before `setProperty`. Do not impose a 2.33334 maximum. Film intensity is linear R, thickness is linear G, and no thickness texture means the maximum. Dynamic UV rows use `airAlbedoUV0/UV1`; color factors are linear, not unconverted HTML sRGB values. See [material parameter contract](../gltf/material-parameter-contract.md).

The request policy is global defaults → instance options, with explicitly supplied legal defaults retained. Priority is a browser hint, not an ordering guarantee. HTTP cache differs from native asset/in-flight/parser caches. Configured/cancellable loads are isolated from the option-free URL-sharing route. Configured headers are same-origin only; cross-origin dependencies do not inherit them, and configured-header redirects fail closed. Browser CORS and forbidden-header rules still apply. External decoder instances remain caller-owned. See [asset loading](asset-loading.md) and [glTF runtime](../gltf/gltf-runtime.md).

## Migration and troubleshooting

- No new options: retain the old loader route and calling shape. Do not add a default signal just to mimic the old path.
- Cancellation: an uncancellable decoder may finish internally. Its late output is discarded; this is not a physical abort promise. Never attach after a stale session token.
- Instancing: animate and morph each native instance, not shared clips/mesh assets. Renderer-owned material instances are destroyed with their renderer; borrowed/shared material instances are not silently owned.
- Bounds: morph-aware bounds recompute on the latest weight change and union the base bounds conservatively. This costs vertex processing when weights change; CPU correctness does not prove a browser culling or performance result.
- Readiness: scene mounted, resource promises, pass inspection, GPU submission and compositor presentation are different. An unknown pass is not ready. Do not warm up with arbitrary ticks while claiming an unchanged business state.
- Depth/research: default projection/depth and sorted transparency stay unchanged. Explicit rejected experiment combinations are expected negatives, not supported features.
- Consumer types: update the actual published package and declarations together. `/math` remains the CPU-only entry; the main entry is browser-only, not SSR. Optional Spark, decoders and physics stay separate.
- `WEBGL2_REQUIRED`, device loss or browser infrastructure failures require an explicit terminal status, not a silent backend or EmptyDevice substitution.

Verification entry points and current blockers are listed in [upstream verification](../reference/upstream-update-verification.md). No historical screenshot or promotion is recertified by this recipe.
