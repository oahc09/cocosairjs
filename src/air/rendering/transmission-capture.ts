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
import { RenderTexture } from '../../cocos/asset/assets/render-texture';
import { Material } from '../../cocos/asset/assets/material';
import { MeshRenderer } from '../../cocos/3d/framework/mesh-renderer';
import { Vec4 } from '../../cocos/core/math';
import { setTransmissionPipelineAvailable } from '../assets/gltf/material/transmission-capability';

/** Transmission meshes move to this layer so the scene-color pass skips them. */
export const TRANSMISSION_LAYER = 1 << 26;

const active = new Set<AirTransmissionCapture>();
/** renderer -> owning capture; a capture never overwrites a renderer bound by another. */
const owned = new WeakMap<MeshRenderer, AirTransmissionCapture>();

/** True when a material carries the compiled transmission UBO member (a transmission material). */
function isTransmissionMaterial (material: Material | null): boolean {
    if (!material) { return false; }
    for (const pass of material.passes) { if (pass.getHandle('airTransmission') !== 0) { return true; } }
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

    get sceneColor (): RenderTexture | null { return this._rt; }

    public onEnable (): void {
        active.add(this);
        this._ensure();
        if (webgl2Capable()) { setTransmissionPipelineAvailable(true, 'scene-color capture active'); }
    }

    public onDisable (): void {
        active.delete(this);
        this._releaseBindings();
        if (active.size === 0) { setTransmissionPipelineAvailable(false, 'no active transmission capture'); }
    }

    public onDestroy (): void {
        this._releaseBindings();
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
            const material = renderer.getMaterialInstance(0);
            if (!material) { continue; }
            material.setProperty('cc_sceneColorTex', this._rt);
            material.setProperty('airSceneColorInfo', info);
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
            if (!node || !isTransmissionMaterial(renderer.getMaterial(0))) { continue; }
            // Move to the transmission layer (offscreen scene-color pass skips it, main draws it).
            if (!(node.layer & TRANSMISSION_LAYER)) { node.layer |= TRANSMISSION_LAYER; }
            main.visibility |= TRANSMISSION_LAYER;
            const owner = owned.get(renderer);
            if (owner === this) { if (this._bound.indexOf(renderer) < 0) { this._bound.push(renderer); } continue; }
            if (owner) { continue; } // owned by another capture — never steal it
            owned.set(renderer, this);
            this._bound.push(renderer);
        }
    }

    /** Release every renderer this capture owns so teardown/deregister drops references. */
    private _releaseBindings (): void {
        for (const renderer of this._bound) { owned.delete(renderer); }
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
