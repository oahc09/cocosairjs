/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 of the Software, and to permit persons to whom the Software is furnished to
 do so, subject to the following conditions:

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
import { Format, LoadOp, StoreOp } from '../../cocos/gfx/base/define';
import { validateIntegerAttachmentClear } from './attachment-clear';

export interface AirMRTAttachmentOptions {
    format: Format;
    filter?: 'nearest' | 'linear';
    loadOp?: LoadOp;
    storeOp?: StoreOp;
    /** Native linear/HDR values; integer attachments require exact in-range integer channels. */
    clearValue?: readonly [number, number, number, number];
}
export interface AirMRTOptions {
    name?: string;
    /** Backing-pixel dimensions before scale, never CSS dimensions. */
    width: number;
    height: number;
    scale?: number;
    samples?: 1 | 2 | 4 | 8;
    sampleFallback?: 'error' | 'lower';
    colorAttachments: readonly AirMRTAttachmentOptions[];
    depthFormat?: Format.UNKNOWN | Format.DEPTH | Format.DEPTH_STENCIL;
}
export interface AirMRTAttachmentInfo {
    readonly format: Format;
    readonly filter: 'nearest' | 'linear';
    readonly loadOp: LoadOp;
    readonly storeOp: StoreOp;
    readonly clearValue: readonly [number, number, number, number];
}
export interface MRTConfiguration {
    readonly name: string;
    readonly width: number;
    readonly height: number;
    readonly scale: number;
    readonly samples: 1 | 2 | 4 | 8;
    readonly sampleFallback: 'error' | 'lower';
    readonly depthFormat: Format;
    readonly colors: readonly AirMRTAttachmentInfo[];
}
const colorFormats = [
    Format.RGBA8,
    Format.SRGB8_A8,
    Format.RGBA16F,
    Format.RGBA32F,
    Format.RG16F,
    Format.R32UI,
    Format.R32I,
];

export function mrtError(code: string, message: string, cause?: unknown): Error {
    return Object.assign(new Error(`[${code}] ${message}`), { code, cause });
}
export function mrtDimension(value: number, name: string): number {
    if (!Number.isSafeInteger(value) || value < 1)
        throw mrtError('AIR_E_MRT_SIZE', `${name} must be a positive integer`);
    return value;
}
export function mrtClear(format: Format, values: readonly number[]): readonly [number, number, number, number] {
    if (!Array.isArray(values) || values.length !== 4 || !values.every(Number.isFinite))
        throw mrtError('AIR_E_MRT_CLEAR_VALUE', 'clearValue must contain four finite native values');
    validateIntegerAttachmentClear(format, values, 'AIR_E_MRT_CLEAR_VALUE');
    return Object.freeze([values[0], values[1], values[2], values[3]]) as readonly [number, number, number, number];
}
function fields(value: object, allowed: readonly string[]): void {
    for (const name of Object.keys(value)) {
        if (!allowed.includes(name) || (value as Record<string, unknown>)[name] === undefined)
            throw mrtError('AIR_E_MRT_OPTION', `Unknown or explicitly undefined option '${name}'`);
    }
}
export function normalizeMRTOptions(options: AirMRTOptions): MRTConfiguration {
    if (!options || typeof options !== 'object' || Array.isArray(options))
        throw mrtError('AIR_E_MRT_OPTIONS', 'Provide MRT options');
    fields(options, [
        'name',
        'width',
        'height',
        'scale',
        'samples',
        'sampleFallback',
        'colorAttachments',
        'depthFormat',
    ]);
    const width = mrtDimension(options.width, 'width'),
        height = mrtDimension(options.height, 'height');
    const scale = options.scale ?? 1,
        samples = options.samples ?? 1;
    const sampleFallback = options.sampleFallback ?? 'error',
        depthFormat = options.depthFormat ?? Format.UNKNOWN;
    if (!Number.isFinite(scale) || scale <= 0) throw mrtError('AIR_E_MRT_SIZE', 'scale must be finite and positive');
    if (![1, 2, 4, 8].includes(samples) || !['error', 'lower'].includes(sampleFallback))
        throw mrtError('AIR_E_MRT_SAMPLES', 'Invalid sample count or fallback');
    if (![Format.UNKNOWN, Format.DEPTH, Format.DEPTH_STENCIL].includes(depthFormat))
        throw mrtError('AIR_E_MRT_DEPTH', 'Unsupported depth format');
    if (options.name !== undefined && typeof options.name !== 'string')
        throw mrtError('AIR_E_MRT_OPTION', 'name must be a string');
    if (!Array.isArray(options.colorAttachments) || !options.colorAttachments.length)
        throw mrtError('AIR_E_MRT_ATTACHMENTS', 'Provide at least one color attachment');
    const colors = options.colorAttachments.map((attachment, index) => {
        if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment))
            throw mrtError('AIR_E_MRT_ATTACHMENT', `Invalid attachment ${index}`);
        fields(attachment, ['format', 'filter', 'loadOp', 'storeOp', 'clearValue']);
        if (!colorFormats.includes(attachment.format))
            throw mrtError('AIR_E_MRT_FORMAT', `Unsupported color format at attachment ${index}`);
        const filter = attachment.filter ?? 'nearest',
            loadOp = attachment.loadOp ?? LoadOp.CLEAR,
            storeOp = attachment.storeOp ?? StoreOp.STORE;
        if (
            !['nearest', 'linear'].includes(filter) ||
            ![LoadOp.LOAD, LoadOp.CLEAR, LoadOp.DISCARD].includes(loadOp) ||
            ![StoreOp.STORE, StoreOp.DISCARD].includes(storeOp)
        )
            throw mrtError('AIR_E_MRT_ATTACHMENT', `Invalid state at attachment ${index}`);
        return Object.freeze({
            format: attachment.format,
            filter,
            loadOp,
            storeOp,
            clearValue: mrtClear(attachment.format, attachment.clearValue ?? [0, 0, 0, 0]),
        });
    });
    return Object.freeze({
        name: options.name ?? 'AirMRT',
        width,
        height,
        scale,
        samples,
        sampleFallback,
        depthFormat,
        colors: Object.freeze(colors),
    });
}
