import { airError } from './app-config';

export interface AirSessionToken { readonly generation: number; isCurrent(): boolean; }
export interface AirSessionChange { readonly generation: number; readonly active: boolean; readonly reason: string | null; }
export interface AirCleanupReceipt {
    readonly status: 'released' | 'failed';
    readonly completed: readonly string[];
    readonly pending: readonly string[];
    readonly failures: readonly Readonly<{ label: string; message: string }>[];
}
export interface AirSessionScope {
    readonly generation: number;
    readonly active: boolean;
    readonly deactivateReason: string | null;
    readonly ownedCount: number;
    activate(): number;
    deactivate(reason?: string): void;
    token(): AirSessionToken;
    /** Cleanup is invoked at most once; unregister transfers its ownership to the caller. */
    own(cleanup: () => void | Promise<void>, label?: string): () => void;
    onChange(callback: (change: AirSessionChange) => void): () => void;
    offChange(callback: (change: AirSessionChange) => void): void;
    /** Default 5s deadline. Does not wait for rendering or restore a lost context. */
    dispose(options?: { timeoutMs?: number }): Promise<AirCleanupReceipt>;
}

/** A cooperative cleanup scope; it cannot preempt a blocking synchronous callback. */
export function createSessionScope (): AirSessionScope {
    let generation = 0, active = false, reason: string | null = null;
    let nextId = 0, disposal: Promise<AirCleanupReceipt> | undefined;
    const callbacks = new Map<number, { label: string; cleanup: () => void | Promise<void> }>();
    const listeners = new Set<(change: AirSessionChange) => void>();
    const subscriptions = new Map<(change: AirSessionChange) => void, Set<(change: AirSessionChange) => void>>();
    const notify = (): void => {
        const change = Object.freeze({ generation, active, reason });
        for (const listener of [...listeners]) { try { listener(change); } catch { /* Observer isolation. */ } }
    };
    return {
        get generation () { return generation; }, get active () { return active; },
        get deactivateReason () { return reason; }, get ownedCount () { return callbacks.size; },
        activate () {
            if (disposal) throw airError('AIR_E_SESSION_CLOSED', 'Create a new scope after disposal.');
            generation++; active = true; reason = null; notify(); return generation;
        },
        deactivate (value = 'deactivate') { active = false; reason = value; notify(); },
        token () {
            const current = generation;
            return Object.freeze({ generation: current, isCurrent: () => !disposal && active && current === generation });
        },
        own (cleanup, label = 'cleanup') {
            if (disposal) throw airError('AIR_E_SESSION_CLOSED', 'Cannot add cleanup after disposal.');
            if (typeof cleanup !== 'function') throw airError('AIR_E_CLEANUP_CALLBACK', 'Cleanup must be a function.');
            const id = ++nextId; callbacks.set(id, { label: `${label}#${id}`, cleanup });
            return () => { callbacks.delete(id); };
        },
        onChange (callback) {
            if (disposal) return () => {};
            const owned = (change: AirSessionChange): void => callback(change);
            const set = subscriptions.get(callback) ?? new Set(); set.add(owned); subscriptions.set(callback, set); listeners.add(owned);
            return () => { listeners.delete(owned); set.delete(owned); if (!set.size) subscriptions.delete(callback); };
        },
        offChange (callback) {
            const set = subscriptions.get(callback); if (!set) return;
            for (const owned of set) listeners.delete(owned); subscriptions.delete(callback);
        },
        dispose (options = {}) {
            if (disposal) return disposal;
            const timeout = options.timeoutMs ?? 5000;
            if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 5000) {
                return Promise.reject(airError('AIR_E_CLEANUP_TIMEOUT', 'timeoutMs must be finite and in (0, 5000].'));
            }
            active = false; reason = 'dispose';
            const entries = [...callbacks.values()]; callbacks.clear();
            const pending = new Set(entries.map((entry) => entry.label));
            const completed: string[] = [], failures: { label: string; message: string }[] = [];
            let timer: ReturnType<typeof setTimeout>;
            // Schedule callbacks only after the shared disposal Promise is installed.
            const work = Promise.all(entries.map((entry) => Promise.resolve().then(entry.cleanup).then(() => {
                pending.delete(entry.label); completed.push(entry.label);
            }, (error) => { pending.delete(entry.label); failures.push({ label: entry.label, message: String(error) }); })));
            disposal = Promise.race([work, new Promise<void>((resolve) => { timer = setTimeout(resolve, timeout); })]).then(() => {
                clearTimeout(timer);
                return Object.freeze({ status: pending.size || failures.length ? 'failed' as const : 'released' as const,
                    completed: Object.freeze([...completed]), pending: Object.freeze([...pending]),
                    failures: Object.freeze(failures.map((failure) => Object.freeze({ ...failure }))) });
            });
            notify(); listeners.clear(); subscriptions.clear();
            return disposal;
        },
    };
}
