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
export type AirToneMapping = 'aces' | 'reinhard' | 'none';
export interface AirPostProcessSettings {
    exposure?: number;
    toneMapping?: AirToneMapping;
    bloom?: { enabled?: boolean; intensity?: number; threshold?: number; softKnee?: number; scatter?: number };
}
export interface AirPostProcessOptions extends AirPostProcessSettings {
    levels?: number;
    resolutionScale?: number;
    samples?: 1 | 2 | 4 | 8;
}
export interface AirPostProcessState {
    exposure: number;
    toneMapping: AirToneMapping;
    bloom: { enabled: boolean; intensity: number; threshold: number; softKnee: number; scatter: number };
}
export function postProcessError(message: string): never {
    throw Object.assign(new TypeError('[AIR_E_POST_PROCESS] ' + message), { code: 'AIR_E_POST_PROCESS' });
}
function number(value: number, key: string, min: number, max: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
        postProcessError(key + ' is outside [' + min + ', ' + max + ']');
    return value;
}
export function normalizePostSettings(
    input: AirPostProcessSettings,
    previous?: AirPostProcessState,
): AirPostProcessState {
    if (!input || typeof input !== 'object' || Array.isArray(input)) postProcessError('settings must be an object');
    for (const key of Object.keys(input))
        if (!['exposure', 'toneMapping', 'bloom'].includes(key)) postProcessError('unknown setting: ' + key);
    if (input.bloom !== undefined && (!input.bloom || typeof input.bloom !== 'object' || Array.isArray(input.bloom)))
        postProcessError('bloom must be an object');
    for (const key of Object.keys(input.bloom || {}))
        if (!['enabled', 'intensity', 'threshold', 'softKnee', 'scatter'].includes(key))
            postProcessError('unknown bloom setting: ' + key);
    const state: AirPostProcessState = {
        exposure: input.exposure === undefined ? (previous?.exposure ?? 1) : input.exposure,
        toneMapping: input.toneMapping === undefined ? (previous?.toneMapping ?? 'aces') : input.toneMapping,
        bloom: {
            enabled: true,
            intensity: 0.6,
            threshold: 1,
            softKnee: 0.5,
            scatter: 0.7,
            ...previous?.bloom,
            ...input.bloom,
        },
    };
    number(state.exposure, 'exposure', 0, 64);
    if (!['aces', 'reinhard', 'none'].includes(state.toneMapping)) postProcessError('unknown toneMapping');
    if (typeof state.bloom.enabled !== 'boolean') postProcessError('bloom.enabled must be boolean');
    number(state.bloom.intensity, 'bloom.intensity', 0, 32);
    number(state.bloom.threshold, 'bloom.threshold', 0, 65504);
    number(state.bloom.softKnee, 'bloom.softKnee', 0, 1);
    number(state.bloom.scatter, 'bloom.scatter', 0, 1);
    return state;
}
/** Final output CPU reference, also used by pixel regressions. Values are linear scene radiance. */
export function airToneMap(value: number, mode: AirToneMapping, exposure = 1): number {
    let x = Math.max(0, value * exposure);
    if (mode === 'aces') x = x > 1e10 ? 2.51 / 2.43 : (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
    else if (mode === 'reinhard') x = x / (1 + x);
    return Math.min(1, Math.max(0, x));
}
export function airLinearToSRGB(value: number): number {
    const x = Math.min(1, Math.max(0, value));
    return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}
