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
import type { Camera } from '../cocos/misc/camera-component';
import type { Node } from '../cocos/scene-graph/node';
import { Vec3 } from '../cocos/core/math';

export interface AirDOMOverlayOptions {
    canvas: HTMLCanvasElement;
    host?: HTMLElement;
    className?: string;
}
export interface AirDOMOverlayBinding {
    /** Call after camera/node changes, or from the application's frame callback. */
    update(): void;
    dispose(): void;
}
export interface AirDOMOverlay {
    readonly root: HTMLDivElement;
    /** Element is borrowed and restored to its original DOM position on detach. */
    attach(element: HTMLElement, node: Node, camera: Camera, options?: { width?: number; height?: number; anchor?: readonly [number, number] }): AirDOMOverlayBinding;
    update(): void;
    dispose(): void;
}

/** Owns one independent overlay; never changes game.container or the host's styles. */
export function createAirDOMOverlay(options: AirDOMOverlayOptions): AirDOMOverlay {
    const { canvas } = options;
    const doc = canvas.ownerDocument, root = doc.createElement('div');
    root.className = options.className ?? 'air-dom-overlay';
    Object.assign(root.style, { position: 'fixed', left: '0', top: '0', width: '0', height: '0', pointerEvents: 'none', zIndex: '1' });
    (options.host ?? doc.body).appendChild(root);
    let disposed = false;
    const bindings = new Set<AirDOMOverlayBinding>(), elements = new Set<HTMLElement>();
    const alive = (): void => { if (disposed) throw new Error('AIR_E_DOM_OVERLAY_DISPOSED'); };
    return {
        root,
        attach(element, node, camera, config = {}) {
            alive();
            if (elements.has(element) || element === canvas || element === root || element.contains(root)) throw new Error('AIR_E_DOM_OVERLAY_ELEMENT');
            const [ax, ay] = config.anchor ?? [0.5, 0.5];
            if (![ax, ay, config.width ?? 1, config.height ?? 1].every(Number.isFinite)
                || (config.width ?? 1) <= 0 || (config.height ?? 1) <= 0) throw new Error('AIR_E_DOM_OVERLAY_SIZE');
            const parent = element.parentNode, next = element.nextSibling, style = element.getAttribute('style');
            const wrapper = doc.createElement('div');
            Object.assign(wrapper.style, { position: 'absolute', pointerEvents: 'auto', transformOrigin: '0 0' });
            root.appendChild(wrapper); wrapper.appendChild(element); elements.add(element);
            if (config.width !== undefined) element.style.width = `${config.width}px`;
            if (config.height !== undefined) element.style.height = `${config.height}px`;
            const a = new Vec3(), b = new Vec3(), c = new Vec3();
            let detached = false;
            const binding: AirDOMOverlayBinding = {
                update() {
                    if (detached) return;
                    if (!node.isValid || !node.activeInHierarchy || !camera.enabledInHierarchy) { wrapper.style.display = 'none'; return; }
                    const m = node.worldMatrix, bounds = canvas.getBoundingClientRect();
                    const width = config.width ?? element.offsetWidth, height = config.height ?? element.offsetHeight;
                    const project = (out: Vec3, x: number, y: number): void => {
                        Vec3.transformMat4(out, new Vec3(x, y, 0), m); camera.worldToScreen(out, out);
                        out.x = bounds.left + out.x * bounds.width / canvas.width;
                        out.y = bounds.top + (canvas.height - out.y) * bounds.height / canvas.height;
                    };
                    if (!canvas.width || !canvas.height || !width || !height) { wrapper.style.display = 'none'; return; }
                    // CSS top-left corresponds to the native node's top-left (Y up).
                    project(a, -ax * width, (1 - ay) * height);
                    project(b, (1 - ax) * width, (1 - ay) * height);
                    project(c, -ax * width, -ay * height);
                    wrapper.style.display = a.z < 0 || a.z > 1 ? 'none' : '';
                    wrapper.style.transform = `matrix(${(b.x - a.x) / width},${(b.y - a.y) / width},${(c.x - a.x) / height},${(c.y - a.y) / height},${a.x},${a.y})`;
                },
                dispose() {
                    if (detached) return; detached = true; bindings.delete(binding); elements.delete(element);
                    if (element.parentNode === wrapper) {
                        if (parent) parent.insertBefore(element, next?.parentNode === parent ? next : null);
                        else element.remove();
                        if (style === null) element.removeAttribute('style'); else element.setAttribute('style', style);
                    }
                    wrapper.remove();
                },
            };
            bindings.add(binding); binding.update(); return binding;
        },
        update() { alive(); bindings.forEach((binding) => binding.update()); },
        dispose() { if (disposed) return; bindings.forEach((binding) => binding.dispose()); root.remove(); disposed = true; },
    };
}
