/**
 * Example-local Gallery lifecycle hook for shader examples.
 * Bridges the example's instance-level create/retire/recreate path into the
 * shared installAssetLifecycle contract (window.__lifecycle / __lifecycleHold).
 *
 * The shared helper's __lifecycle runs at most one round (runs counter) and returns
 * the same report on subsequent calls. This bridge caches the exact promise so
 * concurrent callers observe one atomic round, and controls terminal state.
 *
 * Production behavioral checks (beyond the shared contract):
 * - Retire callback must clear the instance pointer (verified, not assumed).
 * - Fresh instance must be a distinct object (identity-checked against the retired one).
 * - Fresh asset set must cover every original kind (no partial restoration).
 * - Retirement trace refs must match actual refCounts (no self-reported lies).
 * - released() checks refCount AND isValid (valid+refCount0 may mean GPU not freed).
 */
import { installAssetLifecycle } from './asset-lifecycle.js';

interface OwnedAssetRef {
    refCount: number;
    isValid: boolean;
}

interface LifecycleBridgeOptions<Instance> {
    label: string;
    /** True once the example's terminal release (app.close) has run. */
    isDisposed: () => boolean;
    /** Current live instance (null after terminal release or retire). */
    getInstance: () => Instance | null;
    /** Create a new, distinct instance and attach it to the scene.
     *  Must throw if terminally disposed; must NOT reuse the retired object. */
    createInstance: () => Instance;
    /** Retire one instance: unbind renderer, remove node, decRef/destroy owned assets.
     *  Must set the caller's current-instance variable to null when it matches target. */
    retireInstance: (target: Instance) => {
        refs: { kind?: string; name?: string; before: number; after: number }[];
    } & Record<string, unknown>;
    /** Extract the owned assets from an instance for hold()/leak-check. */
    ownedAssets: (target: Instance) => Array<{ name: string; ref: OwnedAssetRef }>;
    /** Optional: advance the engine clock for deferred-destroy observation. */
    stepClock?: () => Promise<void> | void;
}

const DISPOSED_CODE = 'SHADER_LIFECYCLE_DISPOSED';

interface LifecycleWindow {
    __lifecycle?: () => Promise<Record<string, unknown>>;
    __lifecycleHold?: () => number;
}

export function installShaderLifecycle<Instance>(options: LifecycleBridgeOptions<Instance>): void {
    let cachedPromise: Promise<Record<string, unknown>> | null = null;
    let disposed = false;
    const bridgeErrors: string[] = [];

    const checkDisposed = (): void => {
        if (disposed || options.isDisposed()) {
            disposed = true;
            const error = new Error('Shader example has been terminally released');
            Object.assign(error, { code: DISPOSED_CODE });
            throw error;
        }
    };

    const settle = async (): Promise<void> => {
        if (options.stepClock) {
            await options.stepClock();
            await options.stepClock();
            return;
        }
        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 250)));
        });
    };

    let retiredInstance: Instance | null = null;
    let originalAssetNames: string[] = [];
    let retiredAssets: Array<{ name: string; ref: OwnedAssetRef }> = [];
    const retirementReceipt: Array<{ name: string; before: number; after: number; validAfterSettle: boolean }> = [];

    const shared = installAssetLifecycle({
        label: options.label,
        hold: () => {
            if (disposed || options.isDisposed()) return [];
            const current = options.getInstance();
            if (!current) return [];
            const assets = options.ownedAssets(current);
            originalAssetNames = assets.map((a) => a.name);
            // Wrap with released(): refCount 0 alone is insufficient —
            // a still-valid asset with refCount 0 may not have had its GPU resources freed.
            return assets.map((entry) => ({
                ...entry,
                released: () => entry.ref.refCount === 0 && entry.ref.isValid === false,
            }));
        },
        release: async () => {
            checkDisposed();
            const current = options.getInstance();
            if (!current) return;
            const assets = options.ownedAssets(current);
            retiredAssets = assets;
            const beforeRefs = assets.map((asset) => asset.ref.refCount);
            const trace = options.retireInstance(current);
            retiredInstance = current;

            // Production check: retire callback must clear the current instance pointer.
            const stillCurrent = options.getInstance();
            if (stillCurrent === current) {
                bridgeErrors.push('retire did not clear the current instance pointer');
            }

            // Production check: retirement trace refs must match actual refCounts.
            // The three examples return refs in ownedAssets order. Native kind
            // ("mesh") differs from the Gallery label ("film-mesh"); never skip
            // a trace simply because those names do not match.
            if (!Array.isArray(trace.refs) || trace.refs.length !== assets.length) {
                bridgeErrors.push('retirement trace does not cover every owned asset');
            }
            for (const [index, asset] of assets.entries()) {
                const refRow = trace.refs?.[index];
                if (
                    !refRow ||
                    !Number.isSafeInteger(beforeRefs[index]) ||
                    beforeRefs[index] < 1 ||
                    refRow.before !== beforeRefs[index] ||
                    refRow.after !== asset.ref.refCount ||
                    refRow.after !== 0
                ) {
                    bridgeErrors.push(`retirement trace ${asset.name}: references do not match the actual owned asset`);
                }
            }

            await settle();
            retirementReceipt.push(
                ...assets.map((asset, index) => ({
                    name: asset.name,
                    before: beforeRefs[index],
                    after: asset.ref.refCount,
                    validAfterSettle: asset.ref.isValid,
                })),
            );
        },
        reacquire: async () => {
            checkDisposed();
            const fresh = options.createInstance();

            // Production check: fresh instance must be distinct from the retired one.
            if (retiredInstance !== null && fresh === retiredInstance) {
                bridgeErrors.push('reacquire returned the retired instance (not a distinct replacement)');
            }

            // Production check: fresh asset set must cover every original kind.
            const freshAssets = options.ownedAssets(fresh);
            const freshNames = new Set(freshAssets.map((a) => a.name));
            const missing = originalAssetNames.filter((name) => !freshNames.has(name));
            if (
                missing.length > 0 ||
                freshNames.size !== freshAssets.length ||
                freshAssets.length !== originalAssetNames.length
            ) {
                bridgeErrors.push(`reacquire missing previously owned asset kinds: ${missing.join(', ')}`);
            }
            if (
                new Set(freshAssets.map((asset) => asset.ref)).size !== freshAssets.length ||
                freshAssets.some((asset) => retiredAssets.some((retired) => retired.ref === asset.ref))
            ) {
                bridgeErrors.push('reacquire reused retired assets instead of fresh owned assets');
            }

            await settle();
            // Return the FULL asset list (no filtering to hide partial failures)
            return freshAssets;
        },
    });

    // Wrap the shared __lifecycle with promise caching, terminal rejection, and bridge errors.
    const lifecycleWindow = window as unknown as LifecycleWindow;
    const sharedLifecycle = lifecycleWindow.__lifecycle;
    if (sharedLifecycle) {
        lifecycleWindow.__lifecycle = (): Promise<Record<string, unknown>> => {
            if (cachedPromise) return cachedPromise;
            if (disposed || options.isDisposed()) {
                disposed = true;
                return Promise.reject(
                    Object.assign(new Error('Shader example has been terminally released'), { code: DISPOSED_CODE }),
                );
            }
            cachedPromise = (async () => {
                const report = await sharedLifecycle();
                const record = report as Record<string, unknown>;
                record.retirement = retirementReceipt;
                // Merge bridge-level production errors into the report
                if (bridgeErrors.length > 0) {
                    const errors = (record.errors as string[]) ?? [];
                    errors.push(...bridgeErrors);
                    record.errors = errors;
                    record.released = false;
                    record.reloaded = false;
                }
                if (disposed || options.isDisposed()) {
                    disposed = true;
                    record.reloaded = false;
                    const errors = (record.errors as string[]) ?? [];
                    errors.push(DISPOSED_CODE + ': terminal release during pending settle');
                    record.errors = errors;
                }
                return record;
            })();
            return cachedPromise;
        };
    }

    // Terminal __lifecycleHold must report 0 held assets
    const sharedHold = lifecycleWindow.__lifecycleHold;
    if (sharedHold) {
        lifecycleWindow.__lifecycleHold = (): number => {
            if (disposed || options.isDisposed()) {
                disposed = true;
                return 0;
            }
            return sharedHold();
        };
    }
}
