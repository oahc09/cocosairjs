# glTF request policy and cancellation

`GLTFLoaderOptions.request?: AirRequestPolicy` is an additive network policy. It does not replace the native asset manager, change decoder providers, or promise a browser scheduling order.

```ts
import { GLTFLoader, configureGLTFLoaderDefaults } from 'cocosair.js';
import type { AirRequestPolicy } from 'cocosair.js';

configureGLTFLoaderDefaults({ request: { httpCache: 'default', credentials: 'same-origin' } });
const controller = new AbortController();
const request: AirRequestPolicy = { priority: 'high', httpCache: 'no-cache' };
const loader = new GLTFLoader({ request, signal: controller.signal });
try {
    const asset = await loader.loadAsync('/models/model.glb');
    // Mount only if the application's existing session token is still current.
    // Keep asset alive while its instances live; destroy instances before releasing it.
} catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
}
// On navigation/cancel: controller.abort(). Retry with a fresh controller.
```

## Defined-field precedence

The effective policy is global defaults followed by the instance's defined request fields. An omitted/undefined field inherits; explicit `auto`, `default`, and `same-origin` remain explicit overrides. `headers` replaces, not appends to, inherited headers, and is snapshotted so later mutation cannot change an in-flight request. `configureGLTFLoaderDefaults({ request: undefined })` resets the global request policy. Other existing top-level options retain their existing spread/explicit-undefined semantics.

| Field         | Values                           | Meaning                                                                                                                                                                                                                                 |
| ------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `priority`    | `high`, `low`, `auto`            | Fetch scheduling hint, not a guaranteed order. An asset warning records browsers that do not expose Request priority support.                                                                                                           |
| `httpCache`   | standard `RequestCache`          | Browser HTTP cache only. `only-if-cached` uses `mode: 'same-origin'`; cross-origin targets reject rather than changing that contract.                                                                                                   |
| `credentials` | `omit`, `same-origin`, `include` | Standard Fetch credentials policy; cross-origin credentialed requests still need suitable CORS and server policy.                                                                                                                       |
| `headers`     | `HeadersInit`                    | Applied only to the main HTTP(S) origin and same-origin dependencies. Nonempty configured headers force `redirect: 'error'`, including same-origin redirects, because browser-opaque redirects cannot safely establish the next origin. |

Data/blob documents do not establish a trusted HTTP origin. Explicit `parseAsync(data, baseUrl)` uses the supplied HTTP(S) base origin. No configured headers are forwarded to unrelated origins. Use synthetic values in logs/examples; never log secrets.

## Four different caches and ownership

1. The browser HTTP cache is controlled by `httpCache`.
2. Option-free `new GLTFLoader().loadAsync(url)` preserves the existing native asset-manager URL cache and sharing.
3. A configured, cancellable, decoder-configured, or custom-registry loader uses an isolated transport and parse in the same GLTFLoader. It never reads or writes that URL-only native cache. Each consumer owns its returned asset; incompatible policy and cancellation cannot contaminate another consumer.
4. Within one parse, dependency and in-flight promise caches deduplicate work. Failures are evicted, and parse-owned temporary data is released.

This is deliberate isolation, not a new shared resource manager. Changing global defaults does not invalidate assets already cached by bare native `assetManager.loadRemote`. That legacy API keeps its native downloader/header/credential contract; use `GLTFLoader.loadAsync` for the policy/cancellation guarantee described here. Decoder injection is caller-owned: a loader never silently configures or disposes an external decoder or worker pool.

## Cancellation boundary

Pre-abort rejects before work starts. Abort is observed across main fetch, response body, dependent buffers/images, decoder waits, object creation, and final asset handoff. A canceled parse does not publish progress or assets after cancellation, poison a retry cache, or mount a node. The application still uses its existing session token to prevent stale mounting after a successful handoff.

Uncancellable third-party decoding can finish later. Its result is observed and discarded; this is logical consumer cancellation, not a claim that a worker or GPU physically stopped. Late owned image resources are closed/disposed. Parser cleanups and extension handler disposal run when the asset's existing deferred ownership contract finally releases it; repeated cleanup is safe. External decoder providers remain alive.

CPU regression tests cover these ownership and policy rules. They do not establish actual HTTP cache hits, network priority scheduling, CORS deployment, or browser rendering; those require server logs and current browser evidence.
