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
 * T6 transmission/volume/dispersion capability contract.
 *
 * These extensions refract the *opaque scene color*, so they require the runtime to
 * have armed an off-screen, sampleable scene-color pass for the camera (the forward
 * pipeline does this lazily whenever a transmission material is present, on devices
 * that can attach+sample a color render target). Until that pipeline is engaged, the
 * extensions must NOT render as ordinary alpha-blended surfaces while claiming support
 * (Khronos + project rule); they report `device-dependent`, and a `extensionsRequired`
 * file with no core fallback fails with a stable code at load.
 *
 * The forward pipeline reports readiness through `setTransmissionPipelineAvailable`
 * once it has confirmed the active device supports the scene-color attachment; the
 * value is consumed live so the same bundle reports correctly on capable and
 * incapable devices.
 */
let available = false;
let detail = 'transmission pipeline not armed';

/** Called by the renderer when a scene-color transmission pass is usable on this device. */
export function setTransmissionPipelineAvailable (ok: boolean, why?: string): void {
    available = ok;
    detail = why ?? (ok ? 'scene-color pass available' : 'transmission pipeline not armed');
}

/** Current capability as reported to the extension registry / catalogs. */
export function transmissionPipelineAvailable (): { available: boolean; detail: string } {
    return { available, detail };
}
