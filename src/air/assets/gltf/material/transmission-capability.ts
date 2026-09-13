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
