/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/
import type { Box3DModuleReleaseReceipt } from './box3d/loader/st-loader.mjs';

/** Resource acquisition bookkeeping. A successful mock test proves lifecycle, not physics. */
export type AirPreparedBackend = 'box2d-v3-wasm' | 'box3d';
export interface AirPhysicsSceneReleaseResult {
    readonly backend: 'box3d';
    readonly status: 'RESTORED' | 'SKIPPED_NONEMPTY';
}
export interface AirPhysicsCleanupResult {
    readonly retained?: readonly string[];
}
export interface AirPhysicsPreparationReceipt {
    readonly attemptGeneration: number;
    readonly status: 'preparing' | 'prepared' | 'failed' | 'closed' | 'cleanup-failed';
    readonly acquired: readonly Readonly<{
        backend: AirPreparedBackend;
        resource: string;
        cleanup: 'not-attempted' | 'released' | 'failed';
        retained: readonly string[];
    }>[];
    readonly originalError: Readonly<{ code: string | null; message: string }> | null;
    readonly cleanupErrors: readonly Readonly<{ label: string; message: string }>[];
    /** Same acquired module's detached terminal evidence, captured before module release. */
    readonly moduleRelease?: Box3DModuleReleaseReceipt;
}
export interface AirPhysicsPreparation {
    readonly generation: number;
    /**
     * Register only resources actually obtained, before the next fallible/async operation.
     * (backend, resource) uniquely identifies one acquisition for this entire attempt, including
     * after cleanup. Duplicate registration throws without replacing or invoking its disposer.
     * A genuinely distinct acquisition must use a distinct resource key, including late arrivals.
     */
    own(
        backend: AirPreparedBackend,
        resource: string,
        dispose: () => void | AirPhysicsCleanupResult | Promise<void | AirPhysicsCleanupResult>,
        options?: { readonly dependsOn?: readonly string[] },
    ): void;
    /** Internal single acquired-world hook; not a public arbitrary-state trim API. */
    installSceneReleaseHook(callback: () => AirPhysicsSceneReleaseResult): () => void;
    releaseScene(): AirPhysicsSceneReleaseResult | undefined;
    prepared(): void;
    failed(error: unknown): void;
    recordCleanupError(label: string, error: unknown): void;
    /** Internal module disposer only; stores copied data, never a module or live getter. */
    recordBox3DModuleRelease(receipt: Box3DModuleReleaseReceipt): void;
    /** Idempotent; independent resources are attempted even after a failure. Dependencies of failed resources are retained. */
    dispose(): Promise<AirPhysicsPreparationReceipt>;
    diagnostics(): AirPhysicsPreparationReceipt;
}
let generation = 0;

/**
 * This is an admitted-app ownership ledger, not a general async cancellation controller.
 * Bootstrap does not expose it during prepare; app.close is available only after initialization.
 * Loader cancellation/generation handling is separate. Late defensive cleanup is observable via
 * diagnostics(), but a previous immutable dispose receipt cannot certify arbitrary future tasks.
 */
export function createAirPhysicsPreparation(): AirPhysicsPreparation {
    const attemptGeneration = ++generation;
    let status: AirPhysicsPreparationReceipt['status'] = 'preparing';
    let originalError: AirPhysicsPreparationReceipt['originalError'] = null;
    let closing: Promise<AirPhysicsPreparationReceipt> | undefined;
    let sceneReleaseHook: (() => AirPhysicsSceneReleaseResult) | undefined;
    let sceneReleaseBusy = false;
    let moduleRelease: Box3DModuleReleaseReceipt | undefined;
    const cleanupErrors: { label: string; message: string }[] = [];
    const entries: {
        backend: AirPreparedBackend;
        resource: string;
        dispose: () => void | AirPhysicsCleanupResult | Promise<void | AirPhysicsCleanupResult>;
        cleanup: 'not-attempted' | 'released' | 'failed';
        retained: readonly string[];
        dependsOn: readonly string[];
        releasePromise?: Promise<void>;
    }[] = [];
    const diagnostics = (): AirPhysicsPreparationReceipt =>
        Object.freeze({
            attemptGeneration,
            status,
            acquired: Object.freeze(
                entries.map(({ backend, resource, cleanup, retained }) =>
                    Object.freeze({ backend, resource, cleanup, retained: Object.freeze([...retained]) }),
                ),
            ),
            originalError,
            ...(moduleRelease ? { moduleRelease } : {}),
            cleanupErrors: Object.freeze(cleanupErrors.map((error) => Object.freeze({ ...error }))),
        });
    const release = (entry: (typeof entries)[number]): Promise<void> => {
        if (entry.releasePromise) return entry.releasePromise;
        entry.releasePromise = Promise.resolve().then(async () => {
            try {
                const result = await entry.dispose();
                entry.retained = result?.retained ?? [];
                entry.cleanup = 'released';
            } catch (error) {
                entry.cleanup = 'failed';
                entry.retained = [entry.resource];
                cleanupErrors.push({ label: `${entry.backend}:${entry.resource}`, message: String(error) });
            }
        });
        return entry.releasePromise;
    };
    return {
        generation: attemptGeneration,
        recordBox3DModuleRelease(receipt) {
            const acquiredModule = entries.find((entry) => entry.backend === 'box3d' && entry.resource === 'module');
            if (
                moduleRelease ||
                !closing ||
                !acquiredModule?.releasePromise ||
                acquiredModule.cleanup !== 'not-attempted'
            )
                throw new Error(
                    'Module release evidence may be recorded once, only during its acquired module disposal.',
                );
            const ancestors = new Set<object>();
            const copy = (value: unknown): unknown => {
                if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
                if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
                if (value && typeof value === 'object') {
                    const prototype = Object.getPrototypeOf(value);
                    const plain =
                        prototype === null ||
                        (Object.getPrototypeOf(prototype) === null &&
                            Object.prototype.hasOwnProperty.call(prototype, 'constructor') &&
                            typeof prototype.constructor === 'function' &&
                            Function.prototype.toString.call(prototype.constructor) ===
                                Function.prototype.toString.call(Object));
                    if ((!Array.isArray(value) && !plain) || ancestors.has(value))
                        throw new Error('Module release evidence rejects non-plain objects and cycles.');
                    ancestors.add(value);
                    try {
                        return Array.isArray(value)
                            ? Object.freeze(value.map(copy))
                            : Object.freeze(
                                  Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])),
                              );
                    } finally {
                        ancestors.delete(value);
                    }
                }
                throw new Error('Module release evidence must contain only immutable plain data.');
            };
            if (!receipt || !['VERIFIED', 'FAILED'].includes(receipt.status))
                throw new Error('Module release evidence must be terminal.');
            moduleRelease = copy(receipt) as Box3DModuleReleaseReceipt;
        },
        own(backend, resource, dispose, options = {}) {
            if (entries.some((item) => item.backend === backend && item.resource === resource))
                throw new Error(`Duplicate physics acquisition: ${backend}:${resource}`);
            const entry = {
                backend,
                resource,
                dispose,
                cleanup: 'not-attempted' as const,
                retained: [] as readonly string[],
                dependsOn: [...(options.dependsOn ?? [])],
            };
            if (closing) {
                // Defensive self-release: never publish a late acquisition into this closed attempt.
                entries.push(entry);
                void release(entry).then(() => {
                    status = cleanupErrors.length ? 'cleanup-failed' : originalError ? 'failed' : 'closed';
                });
                throw new Error(
                    'Cannot publish an acquisition after preparation cleanup started; self-release scheduled.',
                );
            }

            if (
                entry.dependsOn.some(
                    (name) => !entries.some((item) => item.backend === backend && item.resource === name),
                )
            )
                throw new Error('Physics dependencies must be acquired before dependent resources.');
            entries.push(entry);
        },
        installSceneReleaseHook(callback) {
            if (
                closing ||
                sceneReleaseHook ||
                typeof callback !== 'function' ||
                !entries.some(
                    (entry) =>
                        entry.backend === 'box3d' && entry.resource === 'world' && entry.cleanup === 'not-attempted',
                )
            )
                throw new Error('Scene release requires one live acquired Box3D world.');
            sceneReleaseHook = callback;
            return () => {
                if (sceneReleaseHook === callback) sceneReleaseHook = undefined;
            };
        },
        releaseScene() {
            if (closing || sceneReleaseBusy) throw new Error('Physics scene release is closed or reentrant.');
            if (!sceneReleaseHook) return undefined;
            if (status !== 'prepared') throw new Error('Physics scene release requires a prepared application.');
            sceneReleaseBusy = true;
            try {
                const result = sceneReleaseHook();
                if (result?.backend !== 'box3d' || !['RESTORED', 'SKIPPED_NONEMPTY'].includes(result.status))
                    throw new Error('Invalid physics scene release result.');
                return Object.freeze({ backend: result.backend, status: result.status });
            } finally {
                sceneReleaseBusy = false;
            }
        },
        prepared() {
            if (closing || originalError) throw new Error('Cannot prepare a failed or closed application attempt.');
            status = 'prepared';
        },
        failed(error) {
            if (originalError === null) {
                const value = error as { code?: unknown; message?: unknown } | null;
                originalError = Object.freeze({
                    code: typeof value?.code === 'string' ? value.code : null,
                    message: typeof value?.message === 'string' ? value.message : String(error),
                });
            }
            status = cleanupErrors.length ? 'cleanup-failed' : 'failed';
        },
        recordCleanupError(label, error) {
            cleanupErrors.push({ label, message: String(error) });
            if (closing) status = 'cleanup-failed';
        },
        dispose() {
            if (closing) return closing;
            // Publish before callbacks can reenter. Never let one rejected release skip another.
            closing = Promise.resolve().then(async () => {
                const blocked = new Set<string>();
                for (const entry of [...entries].reverse()) {
                    if (blocked.has(`${entry.backend}:${entry.resource}`)) {
                        entry.retained = [entry.resource];
                        for (const name of entry.dependsOn) blocked.add(`${entry.backend}:${name}`);
                        continue;
                    }
                    await release(entry);
                    if (entry.cleanup === 'failed')
                        for (const name of entry.dependsOn) blocked.add(`${entry.backend}:${name}`);
                }
                status = cleanupErrors.length ? 'cleanup-failed' : originalError ? 'failed' : 'closed';
                return diagnostics();
            });
            return closing;
        },
        diagnostics,
    };
}
