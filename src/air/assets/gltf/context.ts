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
import { Accessor, check, GLTFDocument, integer, item } from './schema';

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const SIZES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const SUPPORTED_EXTENSIONS = new Set(['KHR_materials_unlit', 'KHR_texture_transform']);
export interface AccessorData { values: number[]; components: number; count: number; source: Accessor; }

export function decodeContainer (data: string | ArrayBuffer): { json: GLTFDocument; bin?: ArrayBuffer } {
    let text: string;
    let bin: ArrayBuffer | undefined;
    if (typeof data === 'string') { text = data; } else {
        const view = new DataView(data);
        if (data.byteLength >= 4 && view.getUint32(0, true) === 0x46546c67) {
            check(data.byteLength >= 20, 'truncated GLB header');
            check(view.getUint32(4, true) === 2, 'only GLB 2.0 is supported');
            check(view.getUint32(8, true) === data.byteLength, 'GLB length mismatch');
            let jsonChunk: ArrayBuffer | undefined;
            let chunks = 0;
            for (let offset = 12; offset < data.byteLength;) {
                check(offset + 8 <= data.byteLength, 'truncated GLB chunk header');
                const length = view.getUint32(offset, true);
                const type = view.getUint32(offset + 4, true);
                check(length % 4 === 0 && offset + 8 + length <= data.byteLength, 'invalid GLB chunk length');
                check(chunks !== 0 || type === 0x4e4f534a, 'GLB JSON must be first');
                const chunk = data.slice(offset + 8, offset + 8 + length);
                if (type === 0x4e4f534a) { check(!jsonChunk, 'duplicate JSON chunk'); jsonChunk = chunk; }
                if (type === 0x004e4942) { check(!bin && chunks === 1, 'invalid BIN chunk order'); bin = chunk; }
                offset += 8 + length; ++chunks;
            }
            check(jsonChunk, 'missing GLB JSON');
            text = new TextDecoder('utf-8', { fatal: true }).decode(jsonChunk);
        } else { text = new TextDecoder('utf-8', { fatal: true }).decode(data); }
    }
    const json = JSON.parse(text.replace(/^\uFEFF/, '')) as GLTFDocument;
    check(json && json.asset && json.asset.version === '2.0', 'only glTF 2.0 is supported');
    check(!json.asset.minVersion || json.asset.minVersion === '2.0', 'unsupported asset.minVersion');
    for (const extension of json.extensionsRequired || []) {
        check(SUPPORTED_EXTENSIONS.has(extension), `unsupported required extension: ${extension}`);
    }
    return { json, bin };
}

export class GLTFContext {
    public readonly warnings: string[] = [];
    public readonly buffers: ArrayBuffer[] = [];
    private readonly accessors = new Map<number, AccessorData>();
    private readonly requests = new Map<string, Promise<ArrayBuffer>>();
    constructor (public readonly json: GLTFDocument, public readonly baseUrl?: string) {}

    public warn (message: string): void { this.warnings.push(message); console.warn(`[glTF] ${message}`); }
    public releaseDecodedData (): void { this.buffers.length = 0; this.accessors.clear(); this.requests.clear(); }
    public resolve (uri: string): string {
        if (/^[a-z][a-z0-9+.-]*:/i.test(uri)) { return uri; }
        check(this.baseUrl, `relative resource '${uri}' requires baseUrl`);
        return new URL(uri, this.baseUrl).href;
    }
    public request (uri: string): Promise<ArrayBuffer> {
        const url = this.resolve(uri);
        let promise = this.requests.get(url);
        if (!promise) {
            promise = fetch(url).then((response) => {
                check(response.ok, `request failed: ${url} (${response.status})`);
                return response.arrayBuffer();
            });
            this.requests.set(url, promise);
        }
        return promise;
    }
    public async loadBuffers (bin?: ArrayBuffer): Promise<void> {
        for (const extension of this.json.extensionsUsed || []) {
            if (!SUPPORTED_EXTENSIONS.has(extension)) { this.warn(`optional extension ${extension}: using core fallback where available`); }
        }
        // Sequential ownership makes failure cleanup deterministic; requests are deduplicated within a load.
        for (const [i, buffer] of (this.json.buffers || []).entries()) {
            integer(buffer.byteLength, `buffer ${i} length`);
            const data = buffer.uri !== undefined ? await this.request(buffer.uri) : (i === 0 ? bin : undefined);
            check(data, `buffer ${i}: missing URI/BIN (compressed-only buffers are unsupported)`);
            check(data.byteLength >= buffer.byteLength && (buffer.uri !== undefined || data.byteLength <= buffer.byteLength + 3), `buffer ${i}: length mismatch`);
            this.buffers.push(data.slice(0, buffer.byteLength));
        }
        for (let i = 0; i < (this.json.bufferViews || []).length; ++i) { this.bufferView(i); }
    }
    public bufferView (index: number): Uint8Array {
        const source = item(this.json.bufferViews, index, 'bufferView');
        const buffer = item(this.buffers, source.buffer, 'buffer');
        const offset = integer(source.byteOffset || 0, 'bufferView offset');
        const length = integer(source.byteLength, 'bufferView length');
        check(offset + length <= buffer.byteLength, `bufferView ${index}: out of bounds`);
        return new Uint8Array(buffer, offset, length);
    }
    public accessor (index: number): AccessorData {
        const cached = this.accessors.get(index);
        if (cached) { return cached; }
        const source = item(this.json.accessors, index, 'accessor');
        const size = SIZES[source.componentType];
        const components = COMPONENTS[source.type];
        check(size && components, `accessor ${index}: invalid component/type`);
        const count = integer(source.count, 'accessor count');
        check(count > 0 && count * components <= 16 * 1024 * 1024, `accessor ${index}: exceeds the 16M decoded-component limit`);
        check(!source.normalized || [5120, 5121, 5122, 5123].includes(source.componentType), 'invalid normalized componentType');
        const columns = source.type.startsWith('MAT') ? Math.sqrt(components) : 1;
        const rows = components / columns;
        const columnStride = columns > 1 ? Math.ceil(rows * size / 4) * 4 : rows * size;
        const elementSize = columns * columnStride;
        // Validate source range before allocating the decoded array.
        if (source.bufferView !== undefined) {
            const bv = item(this.json.bufferViews, source.bufferView, 'bufferView');
            const bytes = this.bufferView(source.bufferView);
            check(integer(source.byteOffset || 0, 'accessor offset') + (count - 1) * (bv.byteStride || elementSize) + elementSize <= bytes.byteLength,
                `accessor ${index}: out of bounds`);
        }
        const values: number[] = new Array(count * components).fill(0);
        const read = (bytes: Uint8Array, offset: number, n: number, stride: number, destination: (i: number) => number): void => {
            integer(offset, 'accessor offset');
            check(stride >= elementSize && stride % size === 0 && (bytes.byteOffset + offset) % size === 0,
                `accessor ${index}: invalid alignment/stride`);
            check(columns === 1 || (bytes.byteOffset + offset) % 4 === 0, 'matrix columns require 4-byte alignment');
            check(offset + (n - 1) * stride + elementSize <= bytes.byteLength, `accessor ${index}: out of bounds`);
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            for (let i = 0; i < n; ++i) {
                const dest = destination(i) * components;
                for (let c = 0; c < components; ++c) {
                    const at = offset + i * stride + Math.floor(c / rows) * columnStride + (c % rows) * size;
                    let v = readComponent(view, at, source.componentType);
                    if (source.normalized) {
                        const maximum = source.componentType === 5120 ? 127 : source.componentType === 5121 ? 255 : source.componentType === 5122 ? 32767 : 65535;
                        v = Math.max(-1, v / maximum);
                    }
                    check(Number.isFinite(v), `accessor ${index}: non-finite value`);
                    values[dest + c] = v;
                }
            }
        };
        if (source.bufferView !== undefined) {
            const bv = item(this.json.bufferViews, source.bufferView, 'bufferView');
            if (bv.byteStride !== undefined) { check(bv.byteStride >= 4 && bv.byteStride <= 252 && bv.byteStride % 4 === 0, 'invalid byteStride'); }
            read(this.bufferView(source.bufferView), source.byteOffset || 0, count, bv.byteStride || elementSize, (i) => i);
        } else { check(!source.byteOffset, 'accessor without bufferView cannot have byteOffset'); }
        if (source.sparse) {
            const sparse = source.sparse;
            check(!item(this.json.bufferViews, sparse.indices.bufferView, 'sparse indices view').byteStride
                && !item(this.json.bufferViews, sparse.values.bufferView, 'sparse values view').byteStride, 'sparse bufferViews cannot have byteStride');
            check(integer(sparse.count, 'sparse count') > 0 && sparse.count <= count, 'invalid sparse count');
            check([5121, 5123, 5125].includes(sparse.indices.componentType), 'invalid sparse indices');
            const bytes = this.bufferView(sparse.indices.bufferView);
            const offset = integer(sparse.indices.byteOffset || 0, 'sparse offset');
            const indexSize = SIZES[sparse.indices.componentType];
            check(offset + sparse.count * indexSize <= bytes.byteLength && (bytes.byteOffset + offset) % indexSize === 0, 'sparse indices out of bounds/alignment');
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            const indices: number[] = [];
            for (let i = 0; i < sparse.count; ++i) {
                const value = readComponent(view, offset + i * indexSize, sparse.indices.componentType);
                check(value < count && (i === 0 || value > indices[i - 1]), 'sparse indices must be increasing and in range');
                indices.push(value);
            }
            read(this.bufferView(sparse.values.bufferView), sparse.values.byteOffset || 0, sparse.count, elementSize, (i) => indices[i]);
        }
        const result = { source, values, components, count };
        this.accessors.set(index, result);
        return result;
    }
}

function readComponent (view: DataView, offset: number, type: number): number {
    switch (type) {
    case 5120: return view.getInt8(offset);
    case 5121: return view.getUint8(offset);
    case 5122: return view.getInt16(offset, true);
    case 5123: return view.getUint16(offset, true);
    case 5125: return view.getUint32(offset, true);
    default: return view.getFloat32(offset, true);
    }
}
