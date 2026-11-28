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

import { UIOpacity } from '../../cocos/2d/components/ui-opacity';
import { Component } from '../../cocos/scene-graph/component';
import { Node } from '../../cocos/scene-graph/node';
import type { Scene } from '../../cocos/scene-graph/scene';
import { isValid } from '../../cocos/core/data/object';
import { ccclass } from '../../cocos/core/data/decorators';
import { Vec4 } from '../../cocos/core/math/vec4';
import { Type } from '../../cocos/gfx';
import { getCountFromHandle, getTypeFromHandle } from '../../cocos/render-scene/core/pass-utils';
import { director } from '../../cocos/game';
import { MaterialInstance } from '../../cocos/render-scene/core/material-instance';
import type { AirSessionScope } from '../session-scope';
import type { AirMotionChannel, AirMotionTimeline } from './timeline';

export type AirMotionNodeProperty = `${'position' | 'scale'}.${'x' | 'y' | 'z'}`;

/** Local transforms only; writes go through the engine instead of mutating Vec3 references. */
export function bindAirMotionNode(node: Node, property: AirMotionNodeProperty): AirMotionChannel {
    if (!/^(position|scale)\.[xyz]$/.test(property)) throw new Error('Unsupported motion node property');
    const [key, axis] = property.split('.') as ['position' | 'scale', 'x' | 'y' | 'z'];
    return {
        alive: () => isValid(node, true),
        read: () => node[key][axis],
        write(value) {
            const current = node[key];
            const x = axis === 'x' ? value : current.x;
            const y = axis === 'y' ? value : current.y;
            const z = axis === 'z' ? value : current.z;
            if (key === 'position') node.setPosition(x, y, z);
            else node.setScale(x, y, z);
        },
    };
}

export function bindAirMotionOpacity(opacity: UIOpacity): AirMotionChannel {
    return {
        alive: () => isValid(opacity, true) && isValid(opacity.node, true),
        read: () => opacity.opacity,
        write(value) {
            opacity.opacity = value;
        },
    };
}

/** Caller explicitly admits a float or float4 component on a renderer-owned instance and pass. */
export function bindAirMotionUniform(
    material: MaterialInstance,
    name: string,
    options: { readonly passIndex?: number; readonly component?: 'x' | 'y' | 'z' | 'w' } = {},
): AirMotionChannel {
    const { passIndex = 0, component } = options;
    if (
        !(material instanceof MaterialInstance) ||
        !isValid(material, true) ||
        !isValid(material.owner, true) ||
        !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) ||
        name in Object.prototype ||
        !Number.isInteger(passIndex) ||
        passIndex < 0 ||
        (component !== undefined && !['x', 'y', 'z', 'w'].includes(component))
    ) {
        throw new Error('Unsupported motion material property');
    }
    const handle = material.passes[passIndex]?.getHandle(name);
    if (
        !handle ||
        getCountFromHandle(handle) !== 1 ||
        getTypeFromHandle(handle) !== (component ? Type.FLOAT4 : Type.FLOAT)
    ) {
        throw new Error('Unsupported motion uniform type');
    }
    const readCurrent = (): number | Vec4 => {
        const value = material.getProperty(name, passIndex);
        if (
            component
                ? value instanceof Vec4 && Number.isFinite(value[component])
                : typeof value === 'number' && Number.isFinite(value)
        )
            return value as number | Vec4;
        throw new Error('Initialize the material instance property before binding it');
    };
    readCurrent();
    return {
        alive: () => isValid(material, true) && isValid(material.owner, true),
        read: () => (component ? (readCurrent() as Vec4)[component] : (readCurrent() as number)),
        write(value) {
            if (!component) material.setProperty(name, value, passIndex);
            else {
                const next = (readCurrent() as Vec4).clone();
                next[component] = value;
                material.setProperty(name, next, passIndex);
            }
        },
    };
}

@ccclass('AirMotionDriver')
class AirMotionDriver extends Component {
    frame?: (dt: number) => void;
    release?: () => void;
    update(dt: number): void {
        this.frame?.(dt);
    }
    onDestroy(): void {
        this.release?.();
    }
}

export interface AirMotionDriverHandle {
    /** Replace the timeline, disposing the old one without resetting the current pose. */
    setTimeline(timeline: AirMotionTimeline): void;
    dispose(): void;
}

/** Use the existing component clock, including fixed director.tick(dt) steps. Attach to a live scene. */
export function attachAirMotionDriver(scene: Scene, scope?: AirSessionScope): AirMotionDriverHandle {
    if (director.getScene() !== scene || (scope && !scope.active))
        throw new Error('Motion driver requires the active scene');
    const host = new Node('AirMotionDriver');
    scene.addChild(host);
    const component = host.addComponent(AirMotionDriver);
    const token = scope?.token();
    let active: AirMotionTimeline | undefined,
        closed = false;
    let unregister: (() => void) | undefined, unlisten: (() => void) | undefined;
    const release = (): void => {
        if (closed) return;
        closed = true;
        unregister?.();
        unlisten?.();
        component.frame = undefined;
        component.release = undefined;
        active?.dispose();
        active = undefined;
        if (isValid(host, true)) host.destroy();
    };
    component.release = release;
    component.frame = (dt) => {
        if (director.getScene() !== scene || (token && !token.isCurrent())) release();
        else active?.advance(dt);
    };
    if (scope) {
        unregister = scope.own(release, 'motion-driver');
        unlisten = scope.onChange(() => {
            if (!token!.isCurrent()) release();
        });
    }
    return {
        setTimeline(timeline) {
            if (closed || timeline.disposed) throw new Error('Cannot attach a timeline to a closed motion driver');
            if (timeline === active) return;
            active?.dispose();
            active = timeline;
        },
        dispose: release,
    };
}
