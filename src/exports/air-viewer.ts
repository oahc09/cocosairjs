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

import { createAirApp as bootstrap } from '../air/bootstrap';
import type { AirAppOptions } from '../air/bootstrap';
import { airError } from '../air/app-config';
import { settings, SettingsCategory } from '../cocos/core/settings';

export {
    Camera,
    Color,
    Director,
    Layers,
    Material,
    Node,
    Quat,
    Scene,
    Vec2,
    Vec3,
    Vec4,
    director,
    game,
    macro,
} from './base';
export { MeshRenderer, SkinnedMeshRenderer, utils } from './3d';
export { primitives } from './primitive';
export * from '../air/assets/gltf';
export type { AirApp } from '../air/bootstrap';

const optionalBackends = ['renderMode', 'webgpu', 'physics', 'physicsOptions', 'physics2D', 'box2d3'] as const;
export type AirViewerAppOptions = Omit<AirAppOptions, 'renderer' | (typeof optionalBackends)[number]> & {
    readonly renderer?: 'webgl2';
};

/** Opt-in browser viewer profile. The full SDK remains the compatibility entry. */
export async function createAirApp(options: AirViewerAppOptions) {
    const input = options as AirAppOptions;
    if (
        (input.renderer !== undefined && input.renderer !== 'webgl2') ||
        optionalBackends.some((key) => input[key] !== undefined)
    ) {
        throw airError(
            'AIR_E_VIEWER_PROFILE',
            'This viewer profile accepts WebGL2 only and no optional backend options. Use the full SDK.',
        );
    }
    if (settings.querySettings(SettingsCategory.RENDERING, 'customPipeline')) {
        throw airError('AIR_E_VIEWER_PROFILE', 'The viewer profile requires the legacy pipeline. Use the full SDK.');
    }
    return bootstrap({ ...options, renderer: 'webgl2' });
}
