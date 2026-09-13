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
import { Vec4 } from '../../cocos/core/math';
import { setTransmissionPipelineAvailable } from '../assets/gltf/material/transmission-capability';

/** Transmission meshes move to this layer so the scene-color pass skips them. */
export const TRANSMISSION_LAYER = 1 << 26;

const active = new Set<AirTransmissionCapture>();
/** Transmission materials; the capture binds the live scene color and size into each per frame. */
const tracking = new Set<Material>();

/** Called by the glTF material builder for transmission/volume/dispersion materials. */
export function registerTransmissionMaterial (material: Material): void { tracking.add(material); }

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
    private _scanTick = 0;

    get sceneColor (): RenderTexture | null { return this._rt; }

    public onEnable (): void {
        active.add(this);
        this._ensure();
        if (webgl2Capable()) { setTransmissionPipelineAvailable(true, 'scene-color capture active'); }
    }

    public onDisable (): void {
        active.delete(this);
        if (active.size === 0) { setTransmissionPipelineAvailable(false, 'no active transmission capture'); }
    }

    public onDestroy (): void {
        this._teardown();
    }

    public lateUpdate (): void {
        const main = this.mainCamera;
        if (!main || !this._off || !this._rt) { return; }
        // Periodically adopt transmission meshes: mark their nodes with the layer bit the
        // scene-color pass excludes, and widen the main camera so the glass itself is drawn.
        if (true) {
            const scene = this.node && this.node.scene;
            const meshes = scene && (scene as any).getComponentsInChildren ? (scene as any).getComponentsInChildren('cc.MeshRenderer') : null;
            if (meshes) {
                for (const renderer of meshes) {
                    const material = renderer.getMaterialInstance ? renderer.getMaterialInstance(0) : renderer.sharedMaterial;
                    if (!material) { continue; }
                    for (const pass of material.passes) {
                        if (pass.getHandle('airTransmission') !== 0) {
                            renderer.node.layer |= TRANSMISSION_LAYER;
                            main.visibility |= TRANSMISSION_LAYER;
                            break;
                        }
                    }
                }
            }
        }
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
        // Bind the live scene color + inverse dimensions into every tracked material so the
        // refractive shader converts a view-space offset into texture coordinates.
        const info = new Vec4(this._w, this._h, 1 / Math.max(this._w, 1), 1 / Math.max(this._h, 1));
        for (const material of tracking) {
            material.setProperty('cc_sceneColorTex', this._rt);
            material.setProperty('airSceneColorInfo', info);
        }
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
