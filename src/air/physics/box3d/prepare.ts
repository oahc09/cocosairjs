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
import type { Box3DSTLease, Box3DSTLoader } from './loader/st-loader.mjs';
import type { AirNormalizedBox3DOptions } from './config';
import type { AirPhysicsPreparation } from '../preparation';

/** Internal feature registration. Creating/importing the feature must not request assets. */
export interface Box3DFeatureRegistration {
    readonly createLoader: () => Box3DSTLoader;
}
/** T09 must supply a real engine world adapter; no fallback/no-op world is installed here. */
export interface Box3DPreparedWorld {
    /** Synchronous final registration/selection during PRE_SUBSYSTEM_INIT only. */
    select(): void;
}
export type Box3DWorldAdapter = (
    lease: Box3DSTLease,
    options: AirNormalizedBox3DOptions,
    preparation: AirPhysicsPreparation,
) => Box3DPreparedWorld | Promise<Box3DPreparedWorld>;

let feature: Box3DFeatureRegistration | undefined;
let worldAdapter: Box3DWorldAdapter | undefined;
let loader: Box3DSTLoader | undefined;

function unavailable(code: string, message: string): Error & { code: string } {
    return Object.assign(new Error(`[${code}] ${message}`), { code });
}

export function registerBox3DFeature(registration: Box3DFeatureRegistration): void {
    if (!registration || typeof registration.createLoader !== 'function')
        throw unavailable('AIR_E_BOX3D_CONFIG', 'The feature must provide a lazy loader factory.');
    if (feature && feature.createLoader !== registration.createLoader)
        throw unavailable('AIR_E_BOX3D_CONFIG_CONFLICT', 'A Box3D feature is already registered in this runtime.');
    feature = Object.freeze({ createLoader: registration.createLoader });
}

export function registerBox3DWorldAdapter(adapter: Box3DWorldAdapter): void {
    if (worldAdapter && worldAdapter !== adapter)
        throw unavailable('AIR_E_BOX3D_CONFIG_CONFLICT', 'A Box3D world adapter is already registered.');
    if (typeof adapter !== 'function') throw unavailable('AIR_E_BOX3D_CONFIG', 'Expected a real world adapter.');
    worldAdapter = adapter;
}

/** Called only after application admission and selected 2D preparation, never during module evaluation. */
export async function prepareBox3D(
    options: AirNormalizedBox3DOptions,
    preparation: AirPhysicsPreparation,
): Promise<Box3DPreparedWorld> {
    if (!feature)
        throw unavailable(
            'AIR_E_PHYSICS_BACKEND_UNAVAILABLE',
            'This runtime does not include the physics-box3d feature.',
        );
    if (options.threading !== 'single')
        throw unavailable(
            'AIR_E_BOX3D_VARIANT_UNAVAILABLE',
            'The current Box3D feature is ST only; no implicit fallback.',
        );
    if (!worldAdapter)
        throw unavailable(
            'AIR_E_BOX3D_UNSUPPORTED',
            'Box3D world adapter is not implemented/registered in this runtime.',
        );
    loader ??= feature.createLoader();
    const lease = await loader.prepare({ ...options, threading: 'single', workerCount: 1 });
    preparation.own('box3d', 'module', async () => {
        let failure: unknown;
        let failed = false;
        try {
            await lease.dispose();
        } catch (error) {
            failure = error;
            failed = true;
        }
        // Copy only this lease generation after terminal capture and reference release.
        // A failed dispose must still publish its FAILED evidence, never a stale global receipt.
        try {
            const receipt = lease.diagnostics().moduleRelease;
            if (!receipt) throw unavailable('AIR_E_BOX3D_MODULE_RELEASE', 'Missing acquired module release receipt.');
            preparation.recordBox3DModuleRelease(receipt);
        } catch (error) {
            if (failed) preparation.recordCleanupError('box3d:module-release-receipt', error);
            else {
                failure = error;
                failed = true;
            }
        }
        if (failed) throw failure;
    });
    // The adapter owns every partial world/handle acquisition before any later failure.
    // Native resources must declare { dependsOn: ['module'] } so a failed world release retains its module.
    const prepared = await worldAdapter(lease, options, preparation);
    if (!prepared || typeof prepared.select !== 'function')
        throw unavailable('AIR_E_BOX3D_UNSUPPORTED', 'The Box3D adapter did not provide synchronous final selection.');
    return prepared;
}
