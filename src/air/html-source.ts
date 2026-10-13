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
/** Experimental, engine-free opt-in entry. A native Texture2D is supplied by the caller. */
export interface AirHTMLTextureTarget {
    readonly width: number; readonly height: number;
    reset(info: { width: number; height: number; mipmapLevel: number }): void;
    getGFXTexture(): unknown;
}
interface ElementImageHandle { readonly width: number; readonly height: number; close(): void }
interface ExperimentalCanvas extends HTMLCanvasElement {
    requestPaint(): void;
    captureElementImage(element: HTMLElement): ElementImageHandle;
    updateElementGeometry(element: HTMLElement | ElementImageHandle, options: { canvasTransform?: DOMMatrixInit; clip?: DOMRectInit; preserveHitTestOrder?: boolean }): void;
    clearElementGeometry(element: HTMLElement | ElementImageHandle): void;
}
interface ExperimentalGL extends WebGL2RenderingContext {
    texElementSubImage2D(target: number, level: number, x: number, y: number, source: HTMLElement | ElementImageHandle, options: { width: number; height: number }): void;
}
export interface AirHTMLSourceOptions {
    canvas: HTMLCanvasElement;
    element: HTMLElement;
    texture: AirHTMLTextureTarget;
    resolution?: number;
    autoUpdate?: boolean;
    snapshot?: boolean;
    onUpdate?: () => void;
    onError?: (error: unknown) => void;
}
const canvasLeases = new WeakMap<HTMLCanvasElement, { count: number; original: string | null; layout: string | null }>();
const elementLeases = new WeakSet<HTMLElement>();
export function getAirHTMLSourceSupport(canvas: HTMLCanvasElement): { supported: boolean; reason: string | null } {
    const surface = canvas as ExperimentalCanvas;
    if (typeof surface.requestPaint !== 'function' || typeof surface.captureElementImage !== 'function'
        || typeof surface.updateElementGeometry !== 'function' || typeof surface.clearElementGeometry !== 'function')
        return { supported: false, reason: 'HTML-in-Canvas APIs unavailable; experimental browser support is required' };
    const gl = canvas.getContext('webgl2') as ExperimentalGL | null;
    return gl && typeof gl.texElementSubImage2D === 'function'
        ? { supported: true, reason: null } : { supported: false, reason: 'WebGL2 texElementSubImage2D unavailable' };
}
/** Uploads only on canvas paint events. Owns listeners/snapshots, borrows DOM and Texture2D. */
export function createAirHTMLSource(options: AirHTMLSourceOptions): {
    readonly texture: AirHTMLTextureTarget;
    readonly status: 'waiting' | 'ready' | 'failed' | 'disposed';
    readonly error: unknown;
    /** Queues a paint; upload completion is signalled by onUpdate/onError. */
    update(): void;
    updateGeometry(options: { canvasTransform?: DOMMatrixInit; clip?: DOMRectInit; preserveHitTestOrder?: boolean }): void;
    dispose(): void;
} {
    const { canvas, element, texture } = options, support = getAirHTMLSourceSupport(canvas);
    if (!support.supported) throw Object.assign(new Error(`AIR_E_HTML_SOURCE_UNSUPPORTED: ${support.reason}`), { code: 'AIR_E_HTML_SOURCE_UNSUPPORTED' });
    const resolution = options.resolution ?? canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1;
    if (element.parentNode !== canvas || elementLeases.has(element) || !Number.isFinite(resolution) || resolution <= 0) throw new Error('AIR_E_HTML_SOURCE_OPTIONS: unique direct canvas child and positive resolution required');
    const surface = canvas as ExperimentalCanvas, gl = canvas.getContext('webgl2') as ExperimentalGL;
    const lease = canvasLeases.get(canvas) ?? { count: 0, original: canvas.getAttribute('content'), layout: canvas.getAttribute('layoutsubtree') }, oldDrawable = element.getAttribute('drawable');
    lease.count++; canvasLeases.set(canvas, lease); elementLeases.add(element);
    // Experimental Chrome builds may still use the earlier layoutsubtree spelling.
    canvas.setAttribute('content', 'drawable'); canvas.setAttribute('layoutsubtree', ''); element.setAttribute('drawable', '');
    let disposed = false, pending = true, snapshot: ElementImageHandle | null = null, failed = false;
    let status: 'waiting' | 'ready' | 'failed' | 'disposed' = 'waiting', lastError: unknown = null, snapshotSize: readonly [number, number] | null = null;
    const alive = (): void => { if (disposed) throw new Error('AIR_E_HTML_SOURCE_DISPOSED'); };
    const paint = (): void => {
        if (disposed || failed || (!pending && (options.autoUpdate === false || options.snapshot))) return;
        pending = false;
        try {
            if (gl.isContextLost()) throw new Error('AIR_E_HTML_SOURCE_CONTEXT_LOST');
            if (element.parentNode !== canvas) throw new Error('AIR_E_HTML_SOURCE_ELEMENT_MOVED');
            const width = snapshotSize?.[0] ?? Math.ceil(element.offsetWidth * resolution), height = snapshotSize?.[1] ?? Math.ceil(element.offsetHeight * resolution);
            if (width <= 0 || height <= 0) throw new Error('AIR_E_HTML_SOURCE_SIZE');
            if (texture.width !== width || texture.height !== height) texture.reset({ width, height, mipmapLevel: 1 });
            const target = texture.getGFXTexture() as { gpuTexture?: { glTexture: WebGLTexture | null; glTarget: number; mipLevel: number; glFormat: number; glType: number } } | null;
            const gpu = target?.gpuTexture;
            if (!gpu?.glTexture || !gl.isTexture(gpu.glTexture) || gpu.glTarget !== gl.TEXTURE_2D || gpu.mipLevel !== 1 || gpu.glFormat !== gl.RGBA || gpu.glType !== gl.UNSIGNED_BYTE)
                throw new Error('AIR_E_HTML_SOURCE_TEXTURE: native single-mip RGBA8 WebGL2 Texture2D required');
            if (options.snapshot && !snapshot) { snapshot = surface.captureElementImage(element); snapshotSize = [width, height]; }
            const previous = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
            // Restore actual binding before returning; the engine state cache remains valid.
            try { gl.bindTexture(gl.TEXTURE_2D, gpu.glTexture); gl.texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, snapshot ?? element, { width, height }); }
            finally { gl.bindTexture(gl.TEXTURE_2D, previous); }
            const error = gl.getError(); if (error !== gl.NO_ERROR) throw new Error(`AIR_E_HTML_SOURCE_UPLOAD: WebGL error ${error}`);
            status = 'ready'; lastError = null; options.onUpdate?.();
        } catch (error) { failed = true; status = 'failed'; lastError = error; options.onError?.(error); }
    };
    canvas.addEventListener('paint', paint);
    surface.requestPaint();
    return { texture, get status() { return status; }, get error() { return lastError; },
        update() { alive(); failed = false; pending = true; status = 'waiting'; surface.requestPaint(); },
        updateGeometry(geometry) { alive(); surface.updateElementGeometry(snapshot ?? element, geometry); },
        dispose() {
            if (disposed) return; disposed = true; status = 'disposed'; canvas.removeEventListener('paint', paint);
            let cleanupError: unknown = null;
            try { surface.clearElementGeometry(snapshot ?? element); } catch (error) { cleanupError = error; }
            try { snapshot?.close(); } catch (error) { cleanupError = cleanupError ?? error; } snapshot = null;
            elementLeases.delete(element); lease.count--;
            if (element.getAttribute('drawable') === '') { if (oldDrawable === null) element.removeAttribute('drawable'); else element.setAttribute('drawable', oldDrawable); }
            // Restore content only after the last drawable child is gone.
            if (lease.count === 0) {
                canvasLeases.delete(canvas);
                if (canvas.getAttribute('content') === 'drawable') { if (lease.original === null) canvas.removeAttribute('content'); else canvas.setAttribute('content', lease.original); }
                if (canvas.getAttribute('layoutsubtree') === '') { if (lease.layout === null) canvas.removeAttribute('layoutsubtree'); else canvas.setAttribute('layoutsubtree', lease.layout); }
            }
            if (cleanupError) throw cleanupError;
        },
    };
}
