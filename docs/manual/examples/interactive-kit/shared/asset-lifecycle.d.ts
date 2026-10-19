/**
 * Minimal type declarations matching the real runtime signatures of
 * examples/shared/asset-lifecycle.js. The runtime does not require refCount
 * or isValid on `ref` — those are bridge-level contract additions.
 */

export interface AssetLifecycleEntry {
    name: string;
    ref: object;
    released?: () => boolean;
}

export interface AssetLifecycleReport {
    label: string;
    held: number;
    released: boolean;
    leaked: string[];
    reloaded: boolean;
    errors: string[];
    runs: number;
}

export interface AssetLifecycleContract {
    label?: string;
    /** Non-consuming function; the runtime uses held when hold is absent. */
    hold?: () => AssetLifecycleEntry[];
    held?: AssetLifecycleEntry[];
    /** May be sync or async. */
    release: () => void | Promise<void>;
    /** May return a Promise or the list directly. */
    reacquire: () => AssetLifecycleEntry[] | Promise<AssetLifecycleEntry[]>;
}

export declare function installAssetLifecycle(contract: AssetLifecycleContract): AssetLifecycleReport;
