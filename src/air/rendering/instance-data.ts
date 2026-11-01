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
import { Mat4, Vec4 } from '../../cocos/core/math';

export const INSTANCE_FLOATS = 16;
export const INSTANCE_BYTES = INSTANCE_FLOATS * 4;
const matrixFields = ['m00', 'm01', 'm02', 'm04', 'm05', 'm06', 'm08', 'm09', 'm10', 'm12', 'm13', 'm14'] as const;
export function instanceError(message: string): never {
    throw Object.assign(new RangeError('[AIR_E_INSTANCE_BATCH] ' + message), { code: 'AIR_E_INSTANCE_BATCH' });
}
export function instanceInteger(value: number, label: string, min: number, max: number): void {
    if (!Number.isSafeInteger(value) || value < min || value > max)
        instanceError(`${label} must be in [${min},${max}]`);
}
/** Internal CPU staging/committed data; drawing, bounds and picking consume only committed values. */
export class InstanceData {
    public staged: Float32Array;
    public committed: Float32Array;
    private dirty: Uint8Array;
    private pending = 0;
    public count = 0;
    constructor(public capacity: number) {
        instanceInteger(capacity, 'capacity', 1, 1048576);
        this.staged = this.defaults(capacity);
        this.committed = this.staged.slice();
        this.dirty = new Uint8Array(capacity);
    }
    private defaults(capacity: number): Float32Array {
        const data = new Float32Array(capacity * INSTANCE_FLOATS);
        for (let i = 0; i < capacity; i++) {
            const p = i * INSTANCE_FLOATS;
            data[p] = data[p + 5] = data[p + 10] = 1;
            data.fill(1, p + 12, p + 16);
        }
        return data;
    }
    private mark(index: number, kind: number): void {
        if (!this.dirty[index]) {
            this.pending++;
        }
        this.dirty[index] |= kind;
    }
    public setMatrix(index: number, m: Readonly<Mat4>): void {
        instanceInteger(index, 'instance index', 0, this.capacity - 1);
        if (
            !m ||
            matrixFields.some((k) => !Number.isFinite(m[k]) || Math.abs(m[k]) > 3.402823466e38) ||
            m.m03 !== 0 ||
            m.m07 !== 0 ||
            m.m11 !== 0 ||
            m.m15 !== 1
        )
            instanceError('matrix must be finite affine float32');
        const p = index * 16;
        this.staged.set([m.m00, m.m01, m.m02, m.m12, m.m04, m.m05, m.m06, m.m13, m.m08, m.m09, m.m10, m.m14], p);
        this.mark(index, 2);
    }
    public setColor(index: number, c: Readonly<Vec4>): void {
        instanceInteger(index, 'instance index', 0, this.capacity - 1);
        if (!c || [c.x, c.y, c.z, c.w].some((v) => !Number.isFinite(v) || v < 0 || v > 3.402823466e38) || c.w > 1)
            instanceError('color must be finite nonnegative linear RGBA; alpha <= 1');
        this.staged.set([c.x, c.y, c.z, c.w], index * 16 + 12);
        this.mark(index, 1);
    }
    public readMatrix(index: number, out: Mat4, committed = true): Mat4 {
        instanceInteger(index, 'instance index', 0, this.capacity - 1);
        const d = committed ? this.committed : this.staged,
            p = index * 16;
        return Mat4.set(
            out,
            d[p],
            d[p + 1],
            d[p + 2],
            0,
            d[p + 4],
            d[p + 5],
            d[p + 6],
            0,
            d[p + 8],
            d[p + 9],
            d[p + 10],
            0,
            d[p + 3],
            d[p + 7],
            d[p + 11],
            1,
        );
    }
    public range(start?: number, count?: number): { start: number; count: number } | null {
        if (start === undefined) {
            if (count !== undefined) instanceError('commit count requires start');
            if (!this.pending) return null;
            let first = 0,
                last = this.capacity - 1;
            while (!this.dirty[first]) first++;
            while (!this.dirty[last]) last--;
            return { start: first, count: last - first + 1 };
        }
        instanceInteger(start, 'range start', 0, this.capacity);
        const size = count ?? this.capacity - start;
        instanceInteger(size, 'range count', 0, this.capacity - start);
        return size ? { start, count: size } : null;
    }
    public publish(start: number, count: number): boolean {
        let transformsChanged = false;
        this.committed.set(this.staged.subarray(start * 16, (start + count) * 16), start * 16);
        for (let i = start; i < start + count; i++)
            if (this.dirty[i]) {
                transformsChanged ||= !!(this.dirty[i] & 2);
                this.dirty[i] = 0;
                this.pending--;
            }
        return transformsChanged;
    }
    public reserve(capacity: number): void {
        instanceInteger(capacity, 'capacity', this.capacity, 1048576);
        if (capacity === this.capacity) return;
        const staged = this.defaults(capacity),
            committed = staged.slice(),
            dirty = new Uint8Array(capacity);
        staged.set(this.staged);
        committed.set(this.committed);
        dirty.set(this.dirty);
        this.capacity = capacity;
        this.staged = staged;
        this.committed = committed;
        this.dirty = dirty;
    }
    public get pendingInstances(): number {
        return this.pending;
    }
    public get byteLength(): number {
        return this.staged.byteLength + this.committed.byteLength + this.dirty.byteLength;
    }
    public release(): void {
        this.staged = new Float32Array(0);
        this.committed = new Float32Array(0);
        this.dirty = new Uint8Array(0);
        this.pending = this.count = 0;
    }
}
