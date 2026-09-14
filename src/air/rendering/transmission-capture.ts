/**
 * T6 scene-color transmission pipeline (two-camera, air layer only; the forward render loop is
 * untouched so existing scenes render byte-identically).
 *
 * A lower-priority offscreen camera renders every opaque surface *except* those on the
 * transmission layer into a RenderTexture; the main camera (higher priority) then draws the
 * transmission meshes sampling that scene color with a normal/ior refracted offset, with
 * Beer-Lambert absorption from KHR_materials_volume and RGB channel dispersion.
 *
 * The capability is armed only while a capture is enabled on a WebGL2 device; while unarmed the
 * three extensions report `device-dependent`, so a required file fails cleanly instead of
 * rendering an opaque surface and pretending to support transmission (project + Khronos rule).
 */
import { ccclass } from 'cc.decorator';
import { Component } from '../../cocos/scene-graph/component';
import { Node } from '../../cocos/scene-graph/node';
import { Layers } from '../../cocos/scene-graph/layers';
import { Camera } from '../../cocos/misc/camera-component';
import { API, deviceManager } from '../../cocos/gfx';
import { builtinResMgr } from '../../cocos/asset/asset-manager/builtin-res-mgr';
import { Texture2D } from '../../cocos/asset/assets/texture-2d';
import { RenderTexture } from '../../cocos/asset/assets/render-texture';
import { Material } from '../../cocos/asset/assets/material';
import { MeshRenderer } from '../../cocos/3d/framework/mesh-renderer';
import { Vec4 } from '../../cocos/core/math';
import { setTransmissionPipelineAvailable } from '../assets/gltf/material/transmission-capability';

/** Transmission meshes move to this layer so the scene-color pass skips them. */
export const TRANSMISSION_LAYER = 1 << 26;

const active = new Set<AirTransmissionCapture>();
/** renderer -> { owning capture, node layer before the transmission bit was added }. */
const owned = new WeakMap<MeshRenderer, { capture: AirTransmissionCapture; originalLayer: number }>();

/**
 * True when a material's compiled variant actually enables USE_AIR_TRANSMISSION. The
 * `airTransmission` UBO member exists on EVERY physical material (stable superset layout), so a
 * non-zero handle cannot distinguish transmission — the pass define is the reliable signal.
 */
export function isTransmissionMaterial (material: Material | null): boolean {
    if (!material) { return false; }
    for (const pass of material.passes) {
        const defines = (pass as unknown as { defines?: Record<string, unknown> }).defines;
        if (defines && defines.USE_AIR_TRANSMISSION) { return true; }
    }
    return false;
}

/** True when ANY material slot of the renderer is transmission-active (multi-primitive meshes). */
function isTransmissionRenderer (renderer: MeshRenderer): boolean {
    for (let i = 0; i < 8; i++) {
        const material = renderer.getMaterial(i);
        if (!material) { break; }
        if (isTransmissionMaterial(material)) { return true; }
    }
    return false;
}

function webgl2Capable (): boolean {
    const device = deviceManager.gfxDevice;
    return !!device && device.gfxAPI === API.WEBGL2;
}

/**
 * Add to a node in the scene (one per main camera) and assign `mainCamera` before enabling.
 * While enabled on a capable device, transmission/volume/dispersion report 'supported'.
 */
@ccclass('air.AirTransmissionCapture')
export class AirTransmissionCapture extends Component {
    private _main: Camera | null = null;

    /** The on-screen camera that draws the transmission meshes. Assigning arms the capture
     * even when the component enabled earlier (node activation ordering in Code First apps). */
    public get mainCamera (): Camera | null { return this._main; }
    public set mainCamera (value: Camera | null) {
        this._main = value;
        if (value && this.enabledInHierarchy && !this._off) {
            this._ensure();
            if (webgl2Capable()) { setTransmissionPipelineAvailable(true, 'scene-color capture active'); }
        }
    }

    private _off: Camera | null = null;
    private _offNode: Node | null = null;
    private _rt: RenderTexture | null = null;
    private _w = 0;
    private _h = 0;
    private _bound: MeshRenderer[] = [];
    private _prevVisibility: number | null = null;

    get sceneColor (): RenderTexture | null { return this._rt; }

    public onEnable (): void {
        // Single-capture enforcement: the material instance carries ONE scene-color binding, so
        // a second capture cannot simultaneously serve the same renderer from a different
        // viewpoint. Explicit failure is the spec-conformant boundary (not a silent wrong RT).
        if (this._off === null && active.size > 0) {
            throw new Error('AirTransmissionCapture: only one capture per scene is supported '
                + '(material instances carry a single scene-color binding; multi-camera is not yet implemented).');
        }
        active.add(this);
        this._ensure();
        if (this._off) { this._off.enabled = true; } // resume offscreen rendering on re-enable
        if (webgl2Capable()) { setTransmissionPipelineAvailable(true, 'scene-color capture active'); }
    }

    public onDisable (): void {
        active.delete(this);
        // Stop the offscreen pass and put every mutated piece of appearance state back exactly
        // as found: node layers, main-camera visibility, and the rendered instances' textures.
        if (this._off) { this._off.enabled = false; }
        this._releaseBindings(true);
        if (this._main && this._prevVisibility !== null) {
            this._main.visibility = this._prevVisibility;
            this._prevVisibility = null;
        }
        if (active.size === 0) { setTransmissionPipelineAvailable(false, 'no active transmission capture'); }
    }

    public onDestroy (): void {
        this._releaseBindings(true); // restore textures BEFORE the RenderTexture is destroyed
        this._teardown();
    }

    public lateUpdate (): void {
        const main = this.mainCamera;
        if (!main || !this._off || !this._rt) { return; }
        // Bind the live scene color + inverse dimensions into every transmission renderer's
        // *rendered* material instance (renderer.getMaterialInstance) — the object actually
        // drawn — for the renderers this capture owns. Ownership prevents another capture from
        // clobbering the same renderer's texture, and the rendered instance (not the shared
        // template) is what the model bound, so the update is observable.
        const info = new Vec4(this._w, this._h, 1 / Math.max(this._w, 1), 1 / Math.max(this._h, 1));
        for (const renderer of this._bound) {
            if (!renderer.isValid) { continue; }
            // Bind only slots whose material enables transmission (macro-level check);
            // iterate past the last slot to handle models with many primitives.
            for (let slot = 0; ; slot++) {
                const shared = renderer.getMaterial(slot);
                if (!shared) { break; }
                if (!shared.passes.some((p) => { const d = (p as unknown as { defines?: Record<string, unknown> }).defines; return d && d.USE_AIR_TRANSMISSION; })) { continue; }
                const material = renderer.getMaterialInstance(slot);
                if (!material) { continue; }
                material.setProperty('cc_sceneColorTex', this._rt);
                material.setProperty('airSceneColorInfo', info);
            }
        }
        this._bound = this._bound.filter((renderer) => renderer.isValid);
        this._rescan(main);
        const mw = main.camera.window;
        const w = mw ? mw.width : 0;
        const h = mw ? mw.height : 0;
        if (w > 0 && h > 0 && (w !== this._w || h !== this._h)) {
            this._rt.resize(w, h);
            this._w = w; this._h = h;
        }
        const offNode = this._offNode;
        const mainNode = main.node;
        if (offNode && mainNode) {
            offNode.setWorldPosition(mainNode.worldPosition);
            offNode.setWorldRotation(mainNode.worldRotation);
        }
        this._off.fov = main.fov;
        this._off.near = main.near;
        this._off.far = main.far;
        this._off.visibility = main.visibility & ~TRANSMISSION_LAYER;
    }

    /** Adopt any transmission renderer in the scene not already owned by another capture. */
    private _rescan (main: Camera): void {
        const scene = this.node && this.node.scene;
        if (!scene) { return; }
        for (const renderer of scene.getComponentsInChildren(MeshRenderer)) {
            const node = renderer.node;
            if (!node) { continue; }
            // Macro-level check across ALL material slots (no cap): the airTransmission UBO
            // member exists on every physical material, so the define is the reliable signal.
            let hasTransmission = false;
            for (let slot = 0; ; slot++) {
                const shared = renderer.getMaterial(slot);
                if (!shared) { break; }
                if (shared.passes.some((p) => {
                    const d = (p as unknown as { defines?: Record<string, unknown> }).defines;
                    return d && d.USE_AIR_TRANSMISSION;
                })) { hasTransmission = true; break; }
            }
            if (!hasTransmission) { continue; }
            // Move to the transmission layer (offscreen scene-color pass skips it, main draws it),
            // remembering the pre-scan layer so disable/teardown can restore it exactly.
            if (this._prevVisibility === null) { this._prevVisibility = main.visibility; }
            if (!(node.layer & TRANSMISSION_LAYER)) { node.layer |= TRANSMISSION_LAYER; }
            main.visibility |= TRANSMISSION_LAYER;
            const owner = owned.get(renderer);
            if (owner && owner.capture !== this) { continue; } // owned by another capture — never steal it
            if (!owner) { owned.set(renderer, { capture: this, originalLayer: node.layer & ~TRANSMISSION_LAYER }); }
            if (this._bound.indexOf(renderer) < 0) { this._bound.push(renderer); }
        }
    }

    /** Release every renderer this capture owns; `restore` puts node layers back. */
    private _releaseBindings (restore: boolean): void {
        const defaultTex = builtinResMgr.get('default-texture') as Texture2D;
        for (const renderer of this._bound) {
            const record = owned.get(renderer);
            owned.delete(renderer);
            if (!renderer.isValid) { continue; }
            // Restore the node layer to its pre-capture value.
            if (restore && record && renderer.node) { renderer.node.layer = record.originalLayer; }
            // Restore cc_sceneColorTex / airSceneColorInfo to the default texture on every
            // material slot that carries the transmission define, so a destroyed RenderTexture
            // is never sampled after teardown.
            for (let slot = 0; ; slot++) {
                const instance = renderer.getMaterialInstance(slot);
                if (!instance) { break; }
                const hasTex = instance.getProperty('cc_sceneColorTex');
                if (!hasTex) { break; }
                instance.setProperty('cc_sceneColorTex', defaultTex);
                instance.setProperty('airSceneColorInfo', new Vec4(1, 1, 1, 1));
            }
        }
        this._bound.length = 0;
    }

    private _ensure (): void {
        if (this._off) { return; }
        const scene = this.node && this.node.scene;
        const main = this._main;
        if (!scene || !main) { return; }
        const node = new Node('AirTransmissionCapture');
        scene.addChild(node);
        this._offNode = node;
        const rt = new RenderTexture();
        const mw = main.camera.window;
        rt.initialize({ width: Math.max(mw ? mw.width : 1, 1), height: Math.max(mw ? mw.height : 1, 1) });
        this._rt = rt;
        this._w = rt.width; this._h = rt.height;
        const off = node.addComponent(Camera);
        off.targetTexture = rt;
        off.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        off.priority = main.priority - 1;
        off.visibility = main.visibility & ~TRANSMISSION_LAYER;
        off.projection = Camera.ProjectionType.PERSPECTIVE;
        this._off = off;
        // Arm immediately once the offscreen target exists; material builders read the
        // capability at parse time (before any lateUpdate has run).
        if (webgl2Capable()) { setTransmissionPipelineAvailable(true, 'scene-color capture active'); }
    }

    private _teardown (): void {
        const off = this._off;
        if (off) { off.targetTexture = null; }
        this._off = null;
        if (this._offNode && this._offNode.isValid) { this._offNode.destroy(); }
        this._offNode = null;
        if (this._rt && this._rt.isValid) { this._rt.destroy(); }
        this._rt = null;
    }
}

export const defaultTransmissionVisibility = Layers.Enum.ALL as number;
