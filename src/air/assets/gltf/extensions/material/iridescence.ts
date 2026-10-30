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
/**
 * KHR_materials_iridescence: thin-film layer above the base material.
 * factor [0,1], finite ior >= 1.0, thickness range in nm [0,∞) (min<=max).
 * Textures: iridescenceTexture.R and iridescenceThicknessTexture.G are linear data.
 * Without a thickness texture the effective thickness is maximum, independently of volume.
 * The Khronos schema defines no IOR texture; the historical AIR-only field is non-standard.
 */
import { GLTFError } from '../../diagnostics';
import type { GLTFExtensionFactory, GLTFExtensionHandler } from '../../extension-registry';
import type { GLTFParserContext } from '../../parser-context';
import { physicalScalars } from '../../material/features';

export function iridescenceFactory(context: GLTFParserContext): GLTFExtensionHandler {
    void context;
    const name = 'KHR_materials_iridescence';
    const inRange = (value: number, lo: number, hi: number): boolean =>
        Number.isFinite(value) && value >= lo && value <= hi;
    return {
        name,
        support: () => ({ name, status: 'supported' }),
        validate(ctx): void {
            for (const [index, material] of (ctx.json.materials || []).entries()) {
                const ext = material.extensions?.[name] as
                    | {
                          iridescenceFactor?: number;
                          iridescenceIor?: number;
                          iridescenceThicknessMinimum?: number;
                          iridescenceThicknessMaximum?: number;
                      }
                    | undefined;
                if (!ext) {
                    continue;
                }
                const factor = ext.iridescenceFactor === undefined ? 0 : ext.iridescenceFactor;
                const ior = ext.iridescenceIor === undefined ? 1.3 : ext.iridescenceIor;
                const min = ext.iridescenceThicknessMinimum === undefined ? 100 : ext.iridescenceThicknessMinimum;
                const max = ext.iridescenceThicknessMaximum === undefined ? 400 : ext.iridescenceThicknessMaximum;
                if (!inRange(factor, 0, 1)) {
                    throw new GLTFError(
                        'GLTF_EXTENSION_INVALID',
                        `material ${index}: iridescenceFactor must be [0,1]`,
                        name,
                    );
                }
                if (!Number.isFinite(ior) || ior < 1.0) {
                    throw new GLTFError(
                        'GLTF_EXTENSION_INVALID',
                        `material ${index}: iridescenceIor must be finite and >= 1.0`,
                        name,
                    );
                }
                if (!Number.isFinite(min) || min < 0 || !Number.isFinite(max) || max < min) {
                    throw new GLTFError(
                        'GLTF_EXTENSION_INVALID',
                        `material ${index}: iridescence thickness range must be 0<=min<=max`,
                        name,
                    );
                }
            }
        },
        extendMaterial(_index, features): void {
            const ext = features.source.extensions?.[name] as
                | {
                      iridescenceFactor?: number;
                      iridescenceIor?: number;
                      iridescenceThicknessMinimum?: number;
                      iridescenceThicknessMaximum?: number;
                  }
                | undefined;
            if (!ext) {
                return;
            }
            physicalScalars(features).iridescence = {
                factor: ext.iridescenceFactor === undefined ? 0 : ext.iridescenceFactor,
                ior: ext.iridescenceIor === undefined ? 1.3 : ext.iridescenceIor,
                thicknessMin: ext.iridescenceThicknessMinimum === undefined ? 100 : ext.iridescenceThicknessMinimum,
                thicknessMax: ext.iridescenceThicknessMaximum === undefined ? 400 : ext.iridescenceThicknessMaximum,
            };
        },
    };
}
