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
/** Native values are borrowed from the one main runtime, never rebuilt in the Spark module. */
import * as nativeEngine from '../../index';
import { geometry, math } from '../../index';
export { nativeEngine };
export type { AirApp } from '../../index';
export { Color, Mat3, Mat4, Quat, Vec2, Vec3, Vec4 } from '../../index';
export const { clamp, inverseLerp, lerp, nextPow2, random, repeat, toDegree, toRadian } = math;
export const { AABB, Ray, intersect } = geometry;
export type AABB = InstanceType<typeof geometry.AABB>;
export type Ray = InstanceType<typeof geometry.Ray>;
export const ShapeType = geometry.enums;
export const pt_point_aabb = geometry.distance.pt_point_aabb;
