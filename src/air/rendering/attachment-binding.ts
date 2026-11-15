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
import type { Material, MaterialPropertyFull } from '../../cocos/asset/assets/material';
import type { TextureBase } from '../../cocos/asset/assets/texture-base';
import { Type } from '../../cocos/gfx/base/define';
import { getTypeFromHandle, getCountFromHandle } from '../../cocos/render-scene/core/pass-utils';

/** Material broadcasts properties only to applicable passes; shadow-only passes are not errors. */
export function bindAttachmentTexture(
    material: Material,
    property: string,
    view: TextureBase,
    code: string,
    passIdx?: number,
): { rebind(): void; unbind(): void } {
    const invalid = (message: string): Error => Object.assign(new Error(`[${code}] ${message}`), { code });
    if (
        !material.isValid ||
        (passIdx !== undefined && (!Number.isSafeInteger(passIdx) || passIdx < 0 || passIdx >= material.passes.length))
    )
        throw invalid('Use a live material and a valid pass index');
    const indices =
        passIdx === undefined
            ? material.passes.map((_, index) => index).filter((index) => material.passes[index].getHandle(property))
            : [passIdx];
    if (
        !indices.length ||
        indices.some((index) => {
            const handle = material.passes[index].getHandle(property);
            return !handle || getTypeFromHandle(handle) !== Type.SAMPLER2D || getCountFromHandle(handle) !== 1;
        })
    )
        throw invalid(
            'Use a scalar sampler2D property; incompatible declared properties require an explicit pass index',
        );
    const previous = indices.map((index) => material.getProperty(property, index) as MaterialPropertyFull);
    let applied = 0;
    try {
        for (const index of indices) {
            material.setProperty(property, view, index);
            ++applied;
        }
    } catch (cause) {
        const cleanup: unknown[] = [];
        for (let i = 0; i < applied; ++i) {
            try {
                material.setProperty(property, previous[i] ?? null, indices[i]);
            } catch (error) {
                cleanup.push(error);
            }
        }
        throw Object.assign(invalid('Binding failed; prior applicable pass values were restored where possible'), {
            cause,
            cleanup,
        });
    }
    let bound = true;
    return {
        rebind(): void {
            if (!bound || !material.isValid) return;
            const selected = indices.filter((index) => material.getProperty(property, index) === view);
            for (const index of selected) material.setProperty(property, view, index);
        },
        unbind(): void {
            if (!bound) return;
            bound = false;
            if (!material.isValid) return;
            // Several logical passes can share propertyIndex. Decide ownership before
            // the first restore changes that shared map, then restore every descriptor.
            const selected = indices
                .map((index, offset) => ({ index, offset }))
                .filter((entry) => material.getProperty(property, entry.index) === view);
            const failures: unknown[] = [];
            for (const entry of selected) {
                try {
                    material.setProperty(property, previous[entry.offset] ?? null, entry.index);
                } catch (error) {
                    failures.push(error);
                }
            }
            if (failures.length)
                throw Object.assign(invalid('Some attachment pass values could not be restored'), { failures });
        },
    };
}
