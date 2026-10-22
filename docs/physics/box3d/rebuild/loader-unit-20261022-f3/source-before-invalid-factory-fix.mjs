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

// Internal ST loader, not registered with the engine or app bootstrap yet.
import { createBox3DBinding } from '../binding/facade.mjs';

const HASH = /^[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const matches = (pattern, value) => typeof value === 'string' && pattern.test(value);
const ASSETS = ['box3d-st.mjs', 'box3d-st.wasm', 'facade.mjs', 'facade.d.mts'];
const fail = (code, message) => Object.assign(new Error(message), { code });
const invalid = (message) => fail('AIR_E_BOX3D_CONFIG', message);
function immutableCopy(value) {
    const freeze = (item) => {
        if (item && typeof item === 'object') {
            Object.values(item).forEach(freeze);
            Object.freeze(item);
        }
        return item;
    };
    return freeze(JSON.parse(JSON.stringify(value)));
}

/** No document or network access occurs at module evaluation. */
export function normalizeBox3DSTOptions(options = {}, context = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw invalid('Expected loader options');
    const threading = options.threading === undefined ? 'single' : options.threading;
    if (threading !== 'single') {
        if (threading === 'multi' || threading === 'auto')
            throw fail('AIR_E_BOX3D_VARIANT_UNAVAILABLE', 'This internal loader is ST only; no implicit fallback');
        throw invalid('Unknown threading mode');
    }
    const workerCount = options.workerCount === undefined ? 1 : options.workerCount,
        solverSubSteps = options.solverSubSteps === undefined ? 4 : options.solverSubSteps;
    if (workerCount !== 1) throw invalid('ST requires exactly one execution thread');
    if (![1, 2, 4, 8].includes(solverSubSteps)) throw invalid('solverSubSteps must be 1, 2, 4 or 8');
    const input = options.assetBaseUrl === undefined ? context.defaultAssetBaseUrl : options.assetBaseUrl;
    if (typeof input !== 'string' || !input.trim()) throw invalid('A build-provided or explicit asset URL is required');
    let url;
    try {
        url = new URL(input, context.documentBaseUrl);
    } catch {
        throw invalid('Invalid asset URL');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
        throw invalid('Asset base must be an HTTP(S) directory without credentials, query or fragment');
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return Object.freeze({ assetBaseUrl: url.href, threading, workerCount, solverSubSteps });
}

function validateDescriptor(descriptor) {
    const identity = descriptor?.identity;
    if (
        !matches(HASH, descriptor?.manifestSha256) ||
        !matches(HASH, descriptor?.facadeSha256) ||
        !identity ||
        !matches(REVISION, identity.coreSha) ||
        !matches(REVISION, identity.bindingBaseSha) ||
        !matches(HASH, identity.schemaSha256) ||
        !matches(HASH, identity.patchChainSha256) ||
        identity.abiVersion !== 1 ||
        identity.variant !== 'st-simd'
    )
        throw invalid('A trusted build descriptor with manifest/facade/native identity is required');
    return immutableCopy(descriptor);
}

function validateManifest(manifest, descriptor) {
    if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.artifacts))
        throw fail('AIR_E_BOX3D_MANIFEST', 'Invalid manifest structure');
    for (const [key, value] of Object.entries(descriptor.identity))
        if (JSON.stringify(manifest[key]) !== JSON.stringify(value))
            throw fail('AIR_E_BOX3D_ABI', `Manifest identity mismatch: ${key}`);
    const assets = new Map();
    for (const item of manifest.artifacts) {
        if (
            !item ||
            typeof item.path !== 'string' ||
            !/^[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)*$/.test(item.path) ||
            item.path.split('/').some((part) => part === '.' || part === '..') ||
            assets.has(item.path) ||
            !matches(HASH, item.sha256) ||
            !Number.isSafeInteger(item.bytes) ||
            item.bytes < 1
        )
            throw fail('AIR_E_BOX3D_MANIFEST', 'Invalid, duplicate or non-relative artifact entry');
        assets.set(item.path, Object.freeze({ ...item }));
    }
    for (const path of ASSETS) if (!assets.has(path)) throw fail('AIR_E_BOX3D_MANIFEST', `Missing artifact: ${path}`);
    if (assets.get('facade.mjs').sha256 !== descriptor.facadeSha256)
        throw fail('AIR_E_BOX3D_ABI', 'Manifest facade differs from the facade embedded by this build');
    return assets;
}

async function digest(bytes) {
    if (!globalThis.crypto?.subtle) throw fail('AIR_E_BOX3D_CRYPTO', 'Web Crypto is unavailable');
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
        b.toString(16).padStart(2, '0'),
    ).join('');
}

/**
 * Default transport runs the real generated module and static native facade.
 * Injection seams are for lifecycle tests, not an alternative physics implementation.
 * Loader prefetch hashing is NOT browser dynamic-import SRI.
 */
export function createBox3DSTLoader(descriptor, context = {}, dependencies = {}) {
    const trusted = validateDescriptor(descriptor),
        environment = Object.freeze({ ...context });
    const fetchAsset = dependencies.fetch ?? ((url, options) => globalThis.fetch(url, options));
    const loadModule = dependencies.loadModule ?? ((url) => import(/* @vite-ignore */ url));
    const createBinding = dependencies.createBinding ?? createBox3DBinding;
    const hash = dependencies.digest ?? digest;
    // ST has no workers or explicit WebAssembly.Memory destroy API. Disposal destroys
    // binding-owned worlds/scratch, then drops our module reference for ordinary GC.
    // This does not assert GC completion or whole-heap leak freedom.
    const releaseModule = dependencies.releaseModule ?? (() => {});
    let generation = 0,
        active = null,
        closing = null,
        lastReceipt = null,
        cleanupBlocked = false;
    function current(entry) {
        if (entry.invalidated || active !== entry)
            throw fail('AIR_E_BOX3D_CANCELLED', 'Preparation generation invalidated');
    }
    async function bytes(entry, path, mime, expected) {
        current(entry);
        entry.receipt.requests.push(path);
        const response = await fetchAsset(new URL(path, entry.options.assetBaseUrl).href, {
            signal: entry.controller.signal,
            credentials: 'same-origin',
        });
        current(entry);
        if (!response.ok) throw fail('AIR_E_BOX3D_FETCH', `${path}: HTTP ${response.status}`);
        const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
        if (!mime.includes(type)) throw fail('AIR_E_BOX3D_MIME', `${path}: unexpected MIME ${type || '(missing)'}`);
        const value = new Uint8Array(await response.arrayBuffer());
        current(entry);
        if (
            (expected.bytes !== undefined && value.byteLength !== expected.bytes) ||
            (await hash(value)) !== expected.sha256
        )
            throw fail('AIR_E_BOX3D_ASSET_HASH', `${path}: size or SHA-256 mismatch`);
        current(entry);
        return value;
    }
    async function release(entry) {
        if (entry.released) return;
        entry.released = true;
        const errors = [];
        if (entry.binding) {
            entry.receipt.cleanup.push({ resource: 'binding', attempted: true });
            try {
                entry.binding.dispose();
            } catch (error) {
                errors.push(error);
            }
            entry.binding = null;
        }
        if (entry.module) {
            entry.receipt.cleanup.push({ resource: 'module-reference', attempted: true });
            try {
                await releaseModule(entry.module);
            } catch (error) {
                errors.push(error);
            }
            entry.module = null;
        }
        entry.receipt.cleanupErrors = errors.map((error) => String(error?.message ?? error));
        if (errors.length) {
            cleanupBlocked = true;
            entry.receipt.status = 'CLEANUP_FAILED';
            entry.receipt.cleanupFailure = 'Box3D acquired-resource cleanup failed';
            throw new AggregateError(errors, 'Box3D acquired-resource cleanup failed');
        }
    }
    function prepare(options = {}) {
        const normalized = normalizeBox3DSTOptions(options, environment);
        if (cleanupBlocked)
            throw fail(
                'AIR_E_BOX3D_CLEANUP_FAILED',
                'Previous acquired resources did not cleanly release; loader is closed',
            );
        if (closing) throw fail('AIR_E_BOX3D_BUSY', 'Wait for previous cleanup before retry');
        const key = JSON.stringify(normalized);
        if (active) {
            if (active.key !== key) throw fail('AIR_E_BOX3D_CONFIG_CONFLICT', 'Conflicting preparation already active');
            return active.promise;
        }
        const entry = {
            generation: ++generation,
            options: normalized,
            key,
            controller: new AbortController(),
            invalidated: false,
            released: false,
            module: null,
            binding: null,
            receipt: {
                generation,
                status: 'PREPARING',
                requests: [],
                acquired: [],
                cleanup: [],
                cleanupErrors: [],
                originalError: null,
            },
        };
        active = entry;
        entry.promise = (async () => {
            try {
                const raw = await bytes(entry, 'manifest.json', ['application/json'], {
                    sha256: trusted.manifestSha256,
                });
                let manifest;
                try {
                    manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
                } catch {
                    throw fail('AIR_E_BOX3D_MANIFEST', 'Manifest is not valid UTF-8 JSON');
                }
                const assets = validateManifest(manifest, trusted);
                const wasm = await bytes(entry, 'box3d-st.wasm', ['application/wasm'], assets.get('box3d-st.wasm'));
                await bytes(
                    entry,
                    'box3d-st.mjs',
                    ['text/javascript', 'application/javascript'],
                    assets.get('box3d-st.mjs'),
                );
                const imported = await loadModule(new URL('box3d-st.mjs', normalized.assetBaseUrl).href);
                current(entry);
                if (typeof imported.default !== 'function')
                    throw fail('AIR_E_BOX3D_LOADER', 'Generated loader has no module factory');
                entry.module = await imported.default({
                    wasmBinary: wasm,
                    locateFile(path) {
                        if (path !== 'box3d-st.wasm')
                            throw fail('AIR_E_BOX3D_ASSET_PATH', `Unlisted runtime asset: ${path}`);
                        return new URL(path, normalized.assetBaseUrl).href;
                    },
                });
                if (!entry.module || typeof entry.module !== 'object')
                    throw fail('AIR_E_BOX3D_LOADER', 'Generated factory returned no native module');
                entry.receipt.acquired.push('module-reference');
                current(entry);
                entry.binding = createBinding(entry.module, trusted.identity);
                entry.receipt.acquired.push('binding');
                current(entry);
                entry.receipt.status = 'READY';
                return Object.freeze({
                    binding: entry.binding,
                    options: normalized,
                    generation: entry.generation,
                    dispose: () => dispose(entry.generation),
                });
            } catch (error) {
                entry.receipt.originalError = {
                    code: typeof error?.code === 'string' ? error.code : null,
                    message: String(error?.message ?? error),
                };
                entry.receipt.status = entry.invalidated ? 'CANCELLED' : 'FAILED';
                try {
                    await release(entry);
                } catch (error) {
                    entry.receipt.cleanupFailure = error.message;
                }
                lastReceipt = immutableCopy(entry.receipt);
                if (active === entry) active = null;
                throw error;
            }
        })();
        return entry.promise;
    }
    function dispose(expectedGeneration) {
        if (closing) return closing;
        const entry = active;
        if (!entry || (expectedGeneration !== undefined && entry.generation !== expectedGeneration))
            return Promise.resolve();
        entry.invalidated = true;
        entry.controller.abort();
        // A late factory result must release itself before this attempt can be replaced.
        closing = (async () => {
            try {
                await entry.promise;
            } catch {
                /* original error is retained in its receipt */
            }
            try {
                await release(entry);
            } finally {
                entry.receipt.status = cleanupBlocked
                    ? 'CLEANUP_FAILED'
                    : entry.receipt.originalError
                      ? entry.receipt.status
                      : 'DISPOSED';
                lastReceipt = immutableCopy(entry.receipt);
                if (active === entry) active = null;
            }
        })().finally(() => {
            closing = null;
        });
        return closing;
    }
    return Object.freeze({
        prepare,
        dispose: () => dispose(),
        diagnostics: () => immutableCopy(active?.receipt ?? lastReceipt ?? { status: 'IDLE', generation }),
    });
}
