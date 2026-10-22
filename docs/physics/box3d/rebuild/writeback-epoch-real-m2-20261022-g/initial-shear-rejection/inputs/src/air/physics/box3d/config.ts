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
/** Requested settings are distinct from the effective ST/MT execution mode. */
export interface AirBox3DOptions {
    /** HTTP(S) asset directory; omitted uses the feature's build-provided directory. */
    assetBaseUrl?: string;
    /** Defaults to single. The current ST feature explicitly rejects multi and auto. */
    threading?: 'single' | 'multi' | 'auto';
    /** Total execution threads, including the caller. Single: 1; multi/auto: 2..4. */
    workerCount?: number;
    /** Solver subdivisions within one fixed tick, not PhysicsSystem.maxSubSteps. Default 4. */
    solverSubSteps?: 1 | 2 | 4 | 8;
}
export interface AirNormalizedBox3DOptions {
    readonly assetBaseUrl: string | undefined;
    readonly threading: 'single' | 'multi' | 'auto';
    /** Undefined auto count means the eventual manifest preferred count, not an explicit request for 4. */
    readonly workerCount: number | undefined;
    readonly solverSubSteps: 1 | 2 | 4 | 8;
}

export function box3DConfigurationError(message: string): Error & { code: string } {
    return Object.assign(new Error(`[AIR_E_BOX3D_CONFIG] ${message}`), { code: 'AIR_E_BOX3D_CONFIG' });
}

/** Engine-free, copied and frozen before application admission or any asset request. */
export function normalizeAirBox3DOptions(
    options: AirBox3DOptions = {},
    documentBaseUrl?: string,
): AirNormalizedBox3DOptions {
    if (!options || typeof options !== 'object' || Array.isArray(options))
        throw box3DConfigurationError('physicsOptions.box3d must be an options object.');
    const threading = options.threading === undefined ? 'single' : options.threading;
    if (!['single', 'multi', 'auto'].includes(threading))
        throw box3DConfigurationError('threading must be single, multi or auto.');
    const workerCount =
        options.workerCount === undefined
            ? threading === 'single'
                ? 1
                : threading === 'multi'
                  ? 4
                  : undefined
            : options.workerCount;
    if (
        !(threading === 'auto' && workerCount === undefined) &&
        (!Number.isInteger(workerCount) ||
            workerCount === undefined ||
            (threading === 'single' ? workerCount !== 1 : workerCount < 2 || workerCount > 4))
    )
        throw box3DConfigurationError('workerCount is total threads: single requires 1; multi/auto require 2..4.');
    const solverSubSteps = options.solverSubSteps === undefined ? 4 : options.solverSubSteps;
    if (![1, 2, 4, 8].includes(solverSubSteps)) throw box3DConfigurationError('solverSubSteps must be 1, 2, 4 or 8.');
    let assetBaseUrl: string | undefined;
    if (options.assetBaseUrl !== undefined) {
        if (typeof options.assetBaseUrl !== 'string' || !options.assetBaseUrl.trim())
            throw box3DConfigurationError('assetBaseUrl must be a nonempty URL string.');
        let url: URL;
        try {
            url = new URL(options.assetBaseUrl, documentBaseUrl);
        } catch {
            throw box3DConfigurationError('assetBaseUrl must resolve to an HTTP(S) directory.');
        }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
            throw box3DConfigurationError('assetBaseUrl must be HTTP(S) without credentials, query or fragment.');
        if (!url.pathname.endsWith('/')) url.pathname += '/';
        assetBaseUrl = url.href;
    }
    return Object.freeze({ assetBaseUrl, threading, workerCount, solverSubSteps });
}
