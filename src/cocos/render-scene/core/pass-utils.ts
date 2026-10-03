/*
 Copyright (c) 2017-2023 Xiamen Yaji Software Co., Ltd.

 https://www.cocos.com/

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 of the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

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

import { Type } from '../../gfx';
import { Color, Mat3, Mat4, Vec2, Vec3, Vec4, Quat, IVec2Like, IVec3Like, IVec4Like, IMat3Like, IMat4Like, warnID } from '../../core';
import { isFiniteShaderNumber, propertyTypeError } from '../../core/platform/property-validation';

const typeMask    = 0xfc000000; //  6 bits => 64 types
const bindingMask = 0x03f00000; //  6 bits => 64 bindings
const countMask   = 0x000ff000; //  8 bits => 256 vectors
const offsetMask  = 0x00000fff; // 12 bits => 1024 vectors

export const genHandle = (binding: number, type: Type, count: number, offset = 0): number => ((type << 26) & typeMask)
    | ((binding << 20) & bindingMask) | (count << 12) & countMask | (offset & offsetMask);
export const getTypeFromHandle = (handle: number): number => (handle & typeMask) >>> 26;
export const getBindingFromHandle = (handle: number): number => (handle & bindingMask) >>> 20;
export const getCountFromHandle = (handle: number): number => (handle & countMask) >>> 12;
export const getOffsetFromHandle = (handle: number): number => (handle & offsetMask);
export const customizeType = (handle: number, type: Type): number => (handle & ~typeMask) | ((type << 26) & typeMask);

/**
 * @en Vector type uniforms
 * @zh 向量类型 uniform
 */
export type MaterialProperty = number | Vec2 | Vec3 | Vec4 | Color | Mat3 | Mat4 | Quat;

export const type2reader = {
    [Type.UNKNOWN]: (a: Float32Array, v: number, idx = 0): void => warnID(12010, idx),
    [Type.INT]: (a: Int32Array, v: number, idx = 0): number => a[idx],
    [Type.INT2]: (a: Int32Array, v: IVec2Like, idx = 0): IVec2Like => Vec2.fromArray(v, a, idx),
    [Type.INT3]: (a: Int32Array, v: IVec3Like, idx = 0): IVec3Like => Vec3.fromArray(v, a, idx),
    [Type.INT4]: (a: Int32Array, v: IVec4Like, idx = 0): IVec4Like => Vec4.fromArray(v, a, idx),
    [Type.FLOAT]: (a: Float32Array, v: number, idx = 0): number => a[idx],
    [Type.FLOAT2]: (a: Float32Array, v: IVec2Like, idx = 0): IVec2Like => Vec2.fromArray(v, a, idx),
    [Type.FLOAT3]: (a: Float32Array, v: IVec3Like, idx = 0): IVec3Like => Vec3.fromArray(v, a, idx),
    [Type.FLOAT4]: (a: Float32Array, v: IVec4Like, idx = 0): IVec4Like => Vec4.fromArray(v, a, idx),
    [Type.MAT3]: (a: Float32Array, v: IMat3Like, idx = 0): IMat3Like => Mat3.fromArray(v, a, idx),
    [Type.MAT4]: (a: Float32Array, v: IMat4Like, idx = 0): IMat4Like => Mat4.fromArray(v, a, idx),
};

export const type2writer = {
    [Type.UNKNOWN]: (a: Float32Array, v: number, idx = 0): void => warnID(12010, idx),
    [Type.INT]: (a: Int32Array, v: number, idx = 0): number => a[idx] = v,
    [Type.INT2]: (a: Int32Array, v: Vec2, idx = 0): Int32Array => Vec2.toArray(a, v, idx),
    [Type.INT3]: (a: Int32Array, v: Vec3, idx = 0): Int32Array => Vec3.toArray(a, v, idx),
    [Type.INT4]: (a: Int32Array, v: Vec4, idx = 0): Int32Array => Vec4.toArray(a, v, idx),
    [Type.FLOAT]: (a: Float32Array, v: number, idx = 0): number => a[idx] = v,
    [Type.FLOAT2]: (a: Float32Array, v: Vec2, idx = 0): Float32Array => Vec2.toArray(a, v, idx),
    [Type.FLOAT3]: (a: Float32Array, v: Vec3, idx = 0): Float32Array => Vec3.toArray(a, v, idx),
    [Type.FLOAT4]: (a: Float32Array, v: Vec4, idx = 0): Float32Array => Vec4.toArray(a, v, idx),
    [Type.MAT3]: (a: Float32Array, v: Mat3, idx = 0): Float32Array => Mat3.toArray(a, v, idx),
    [Type.MAT4]: (a: Float32Array, v: Mat4, idx = 0): Float32Array => Mat4.toArray(a, v, idx),
};

export const type2validator = {
    [Type.INT]: (v: number): boolean => typeof v === 'number',
    [Type.FLOAT]: (v: number): boolean => typeof v === 'number',
    [Type.INT2]: (v: Vec2): boolean => !!(v instanceof Vec2),
    [Type.FLOAT2]: (v: Vec2): boolean => !!(v instanceof Vec2),
    [Type.INT3]: (v: Vec3): boolean => !!(v instanceof Vec3),
    [Type.FLOAT3]: (v: Vec3): boolean => !!(v instanceof Vec3),
    [Type.INT4]: (v: Vec4): boolean => !!(v instanceof Vec4),
    [Type.FLOAT4]: (v: Vec4 | Color | Quat): boolean => !!((v instanceof Vec4) || (v instanceof Color) || (v instanceof Quat)),
    [Type.MAT3]: (v: Mat3): boolean => !!(v instanceof Mat3),
    [Type.MAT4]: (v: Mat4): boolean => !!(v instanceof Mat4),
};

const uniformExamples: Partial<Record<Type, string>> = {
    [Type.INT]: '1', [Type.FLOAT]: '1',
    [Type.INT2]: 'new Vec2(1, 2)', [Type.FLOAT2]: 'new Vec2(1, 2)',
    [Type.INT3]: 'new Vec3(1, 2, 3)', [Type.FLOAT3]: 'new Vec3(1, 2, 3)',
    [Type.INT4]: 'new Vec4(1, 2, 3, 4)',
    [Type.FLOAT4]: 'new Vec4(1, 2, 3, 4), new Color(255, 128, 64, 255), or new Quat(0, 0, 0, 1)',
    [Type.MAT3]: 'new Mat3()', [Type.MAT4]: 'new Mat4()',
};
const vectorKeys = ['x', 'y', 'z', 'w'] as const;
const matrixKeys = Array.from({ length: 16 }, (_, i) => `m${String(i).padStart(2, '0')}`);

function validUniformElement (type: Type, value: MaterialProperty): boolean {
    const validator = type2validator[type];
    if (!validator || !validator(value)) { return false; }
    if (typeof value === 'number') { return isFiniteShaderNumber(value); }
    const keys = type === Type.MAT3 ? matrixKeys.slice(0, 9) : type === Type.MAT4 ? matrixKeys
        : vectorKeys.slice(0, (type === Type.INT2 || type === Type.FLOAT2) ? 2 : (type === Type.INT3 || type === Type.FLOAT3) ? 3 : 4);
    return keys.every((key) => isFiniteShaderNumber(value[key]));
}

/** Validate the entire write before touching a staging block (including partial array updates). */
export function validateUniformValue (
    type: Type, value: MaterialProperty | MaterialProperty[], count: number, property: string | (() => string), array = false,
): void {
    let valid = !Array.isArray(value) && !array && validUniformElement(type, value as MaterialProperty);
    if (array) {
        valid = Array.isArray(value) && value.length <= count;
        if (valid) {
            const values = value as MaterialProperty[];
            // Array.every skips holes, while the writer visits each index.
            for (let i = 0; i < values.length; ++i) {
                if (values[i] !== null && !validUniformElement(type, values[i])) { valid = false; break; }
            }
        }
    }
    if (valid) { return; }
    const name = typeof property === 'function' ? property() : property;
    const example = uniformExamples[type] || Type[type];
    throw propertyTypeError('AIR_E_MATERIAL_TYPE', name, `${Type[type]} with finite components${array ? `; array count <= ${count}` : ''}`,
        array ? `[${example}] (one typed value per uniform element)` : example);
}

const defaultValues = [
    Object.freeze([0]),
    Object.freeze([0, 0]),
    Object.freeze([0, 0, 0, 0]),
    Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
];

/**
 * @en Gets the default values for the given type of uniform
 * @zh 根据指定的 Uniform 类型来获取默认值
 * @param type The type of the uniform
 */
export function getDefaultFromType (type: Type): readonly number[] | string {
    switch (type) {
    case Type.BOOL:
    case Type.INT:
    case Type.UINT:
    case Type.FLOAT:
        return defaultValues[0];
    case Type.BOOL2:
    case Type.INT2:
    case Type.UINT2:
    case Type.FLOAT2:
        return defaultValues[1];
    case Type.BOOL4:
    case Type.INT4:
    case Type.UINT4:
    case Type.FLOAT4:
        return defaultValues[2];
    case Type.MAT4:
        return defaultValues[3];
    case Type.SAMPLER2D:
        return 'default-texture';
    case Type.SAMPLER_CUBE:
        return 'default-cube-texture';
    case Type.SAMPLER2D_ARRAY:
        return 'default-array-texture';
    case Type.SAMPLER3D:
        return 'default-3d-texture';
    default:
    }
    return defaultValues[0];
}

export function getStringFromType (type: Type) : string {
    switch (type) {
    case Type.SAMPLER2D:
        return '-texture';
    case Type.SAMPLER_CUBE:
        return '-cube-texture';
    case Type.SAMPLER2D_ARRAY:
        return '-array-texture';
    case Type.SAMPLER3D:
        return '-3d-texture';
    default:
        return '-unknown';
    }
}

/**
 * @en Combination of preprocess macros
 * @zh 预处理宏组合
 */
export type MacroRecord = Record<string, number | boolean | string>;

/**
 * @en Override the preprocess macros
 * @zh 覆写预处理宏
 * @param target Target preprocess macros to be overridden
 * @param source Preprocess macros used for override
 */
export function overrideMacros (target: MacroRecord, source: MacroRecord): boolean {
    const entries = Object.entries(source);
    let isDifferent = false;
    for (let i = 0; i < entries.length; i++) {
        if (target[entries[i][0]] !== entries[i][1]) {
            target[entries[i][0]] = entries[i][1];
            isDifferent = true;
        }
    }
    return isDifferent;
}
