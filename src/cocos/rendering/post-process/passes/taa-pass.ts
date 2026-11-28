import { EDITOR } from 'internal:constants';
import { Mat4, Vec2, Vec4 } from '../../../core';
import { API, ClearFlagBit, Format } from '../../../gfx';
import { Camera, CameraUsage } from '../../../render-scene/scene';
import { Pipeline } from '../../custom/pipeline';
import { ResourceResidency } from '../../custom/types';
import { getCameraUniqueID } from '../../custom/define';
import { TAA } from '../components/taa';
import { TAAMask } from '../components/taa-mask';
import { passContext } from '../utils/pass-context';
import { disablePostProcessForDebugView, getRTFormatBeforeToneMapping } from './base-pass';
import { getSetting, SettingPass } from './setting-pass';
import { builtinResMgr } from '../../../asset/asset-manager';
import { Material, Texture2D } from '../../../asset/assets';
import { MaterialInstance } from '../../../render-scene';
import { airWebGL2TAAFragment } from '../../../../air/builtin/taa-depth-clamp';

const halton8 = [
    new Vec2(0.5, 1.0 / 3),
    new Vec2(0.25, 2.0 / 3),
    new Vec2(0.75, 1.0 / 9),
    new Vec2(0.125, 4.0 / 9),
    new Vec2(0.625, 7.0 / 9),
    new Vec2(0.375, 2.0 / 9),
    new Vec2(0.875, 5.0 / 9),
    new Vec2(0.0625, 8.0 / 9),
];
halton8.forEach((v) => {
    v.x -= 0.5;
    v.y -= 0.5;
});

const SampleOffsets = {
    // 2xMSAA
    // Pattern docs: http://msdn.microsoft.com/en-us/library/windows/desktop/ff476218(v=vs.85).aspx
    //   N.
    //   .S
    x2: [
        new Vec2(-4.0 / 16.0, -4.0 / 16.0),
        new Vec2(4.0 / 16.0, 4.0 / 16.0),
    ],

    // 3xMSAA
    //   A..
    //   ..B
    //   .C.
    // Rolling circle pattern (A,B,C).
    x3: [
        new Vec2(-2.0 / 3.0, -2.0 / 3.0),
        new Vec2(2 / 3, 0 / 3),
        new Vec2(0 / 3, 2 / 3),
    ],

    // 4xMSAA
    // Pattern docs: http://msdn.microsoft.com/en-us/library/windows/desktop/ff476218(v=vs.85).aspx
    //   .N..
    //   ...E
    //   W...
    //   ..S.
    // Rolling circle pattern (N,E,S,W).
    x4: [
        new Vec2(-2 / 16, -6 / 16),
        new Vec2(6 / 16, -2 / 16),
        new Vec2(2 / 16, 6 / 16),
        new Vec2(-6 / 16, 2 / 16),
    ],

    x5: [
        // Compressed 4 sample pattern on same vertical and horizontal line (less temporal flicker).
        // Compressed 1/2 works better than correct 2/3 (reduced temporal flicker).
        //   . N .
        //   W . E
        //   . S .
        // Rolling circle pattern (N,E,S,W).
        new Vec2(0, -1 / 2),
        new Vec2(1 / 2, 0),
        new Vec2(0, 1 / 2),
        new Vec2(-1 / 2, 0),
    ],

    halton8,
};

class CameraHistory {
    constructor (public readonly slot: number) {}
    readonly previous = new Mat4();
    readonly offset = new Vec2();
    readonly params = new Vec4();
    readonly size = new Vec4();
    frame = -1;
    output = 0;
    valid = false;
    width = 0;
    height = 0;
    window: Camera['window'] | undefined;
    scene: Camera['scene'] | undefined;
    setting: TAA | undefined;
    revision = 0;
    material: MaterialInstance | undefined;
    maskMaterial: MaterialInstance | undefined;
    snapshotMaterial: MaterialInstance | undefined;
    compositeMaterial: MaterialInstance | undefined;
    isolateTransparent = false;

    reset (): void {
        this.valid = false;
        this.frame = -1;
    }
}

export class TAAPass extends SettingPass {
    get setting (): TAA { return getSetting(TAA); }

    name = 'TAAPass';
    effectName = 'pipeline/post-process/taa';
    outputNames = ['TAA_First', 'TAA_Second'];
    private readonly histories = new Map<Camera, CameraHistory>();
    private readonly idle: CameraHistory[] = [];
    private nextSlot = 0;

    /** Recycle by peak concurrent cameras instead of accumulating persistent targets per camera ID. */
    beginFrame (cameras: ReadonlySet<Camera>): void {
        for (const camera of this.histories.keys()) {
            if (!cameras.has(camera)) this.disableCamera(camera);
        }
    }

    disableCamera (camera: Camera): void {
        const state = this.histories.get(camera);
        if (!state) return;
        this.histories.delete(camera);
        state.reset();
        state.window = undefined;
        state.scene = undefined;
        state.setting = undefined;
        state.maskMaterial?.setProperty('motionMaskTex', builtinResMgr.get('black-texture') as Texture2D);
        this.idle.push(state);
    }

    checkEnable (camera: Camera): boolean {
        return super.checkEnable(camera)
            && !(EDITOR && camera.cameraUsage === CameraUsage.PREVIEW)
            && !disablePostProcessForDebugView();
    }

    private historyName (state: CameraHistory, index: number): string {
        return `${this.outputNames[index]}${this.name}_${this._id}_${state.slot}`;
    }

    private opaqueSnapshot (state: CameraHistory): string {
        return `TAA_OpaqueSource_${this._id}_${state.slot}`;
    }

    private compositeName (state: CameraHistory): string {
        return `TAA_Composited_${this._id}_${state.slot}`;
    }

    captureOpaqueColor (camera: Camera, ppl: Pipeline, source: string): void {
        const state = this.histories.get(camera);
        if (!state?.isolateTransparent) return;
        const target = this.opaqueSnapshot(state);
        if (!state.snapshotMaterial) state.snapshotMaterial = new MaterialInstance({ parent: this.material });
        const snapshot = state.snapshotMaterial;
        snapshot.setProperty('taaParams1', new Vec4(0, 0, 0, 2));
        passContext.clearFlag = ClearFlagBit.COLOR;
        Vec4.set(passContext.clearColor, 0, 0, 0, 1);
        passContext.material = snapshot;
        passContext
            .updatePassViewPort()
            .addRenderPass('DeferredTAA0', `CameraTAASnapshot${getCameraUniqueID(camera)}`)
            .setPassInput(source, 'inputTexture')
            .setPassInput(passContext.depthSlotName, 'depthTex')
            .setPassInput(source, 'taaPrevTexture')
            .addRasterView(target, getRTFormatBeforeToneMapping(ppl))
            .blitScreen(0)
            .version();
    }

    slotName (camera: Camera, index = 0): string {
        const state = this.histories.get(camera);
        if (!state || !this.checkEnable(camera)) return this.lastPass!.slotName(camera, index);
        return state.isolateTransparent ? this.compositeName(state) : this.historyName(state, state.output);
    }

    prepareCamera (camera: Camera, ppl: Pipeline, allowsIsolation = false): void {
        let state = this.histories.get(camera);
        if (!state) {
            state = this.idle.pop() ?? new CameraHistory(this.nextSlot++);
            this.histories.set(camera, state);
        }
        const { width, height } = passContext.viewport;
        const setting = this.setting;
        let isolateTransparent = false;
        if (allowsIsolation && setting.isolateTransparentHistory && ppl.device.gfxAPI === API.WEBGL2
            && !EDITOR && !camera.node.getComponent(TAAMask)?.mask) {
            const effect = this.material.effectAsset;
            const shader = effect?.shaders.find((entry) => entry.name === `${this.effectName}|vs|fs`);
            const fragment = shader?.glsl3.frag;
            isolateTransparent = !!(effect && shader && fragment
                && airWebGL2TAAFragment(effect.name, shader.name, shader.hash, fragment) !== fragment);
        }
        if (state.isolateTransparent !== isolateTransparent) state.reset();
        state.isolateTransparent = isolateTransparent;
        if (state.width !== width || state.height !== height || state.window !== camera.window
            || state.scene !== camera.scene || state.setting !== setting || state.revision !== setting.historyRevision) {
            state.reset();
            state.width = width;
            state.height = height;
            state.window = camera.window;
            state.scene = camera.scene;
            state.setting = setting;
            state.revision = setting.historyRevision;
        }

        state.frame = (state.frame + 1) % SampleOffsets.halton8.length;
        const sample = SampleOffsets.halton8[state.frame];
        (camera as any)._isProjDirty = true;
        camera.update(true);
        const proj = camera.matProj;
        if (ppl.device.gfxAPI === API.WEBGL2) {
            const dx = sample.x * setting.sampleScale * 2 / Math.max(1, width);
            const dy = sample.y * setting.sampleScale * 2 / Math.max(1, height);
            // Shift clip XY by NDC delta times W; this is depth-independent for either projection.
            proj.m00 += dx * proj.m03; proj.m01 += dy * proj.m03;
            proj.m04 += dx * proj.m07; proj.m05 += dy * proj.m07;
            proj.m08 += dx * proj.m11; proj.m09 += dy * proj.m11;
            proj.m12 += dx * proj.m15; proj.m13 += dy * proj.m15;
            // The resolve subtracts this value in its current-image lookup.
            state.offset.set(-dx, -dy);
        } else {
            // WebGPU shader-space conventions need their own runtime verification.
            state.offset.set(sample.x * setting.sampleScale / Math.max(1, width), sample.y * setting.sampleScale / Math.max(1, height));
            proj.m12 += state.offset.x;
            proj.m13 += state.offset.y;
        }
        Mat4.invert(camera.matProjInv, proj);
        Mat4.multiply(camera.matViewProj, proj, camera.matView);
        Mat4.invert(camera.matViewProjInv, camera.matViewProj);
        camera.frustum.update(camera.matViewProj, camera.matViewProjInv);
    }

    public render (camera: Camera, _ppl: Pipeline): void {
        const state = this.histories.get(camera)!;
        const cameraID = getCameraUniqueID(camera);
        const setting = this.setting;
        passContext.clearFlag = ClearFlagBit.COLOR;
        Vec4.set(passContext.clearColor, 0, 0, 0, 1);
        passContext.updatePassViewPort();
        const { width, height } = passContext.passViewport;

        const taaMask = camera.node.getComponent(TAAMask);
        const mask = taaMask?.enabledInHierarchy ? taaMask.mask : undefined;
        const black = builtinResMgr.get('black-texture') as Texture2D;
        let material: Material;
        if (mask) {
            if (!state.maskMaterial) {
                state.maskMaterial = new MaterialInstance({ parent: this.material });
                state.maskMaterial.recompileShaders({ USE_TAA_MASK: !EDITOR });
            }
            material = state.maskMaterial;
        } else {
            if (!state.material) state.material = new MaterialInstance({ parent: this.material });
            material = state.material;
            state.maskMaterial?.setProperty('motionMaskTex', black);
        }
        material.setProperty('motionMaskTex', mask ?? black);
        material.setProperty('taaParams1', state.params.set(state.offset.x, state.offset.y, state.valid ? setting.feedback : 0, 0));
        material.setProperty('taaTextureSize', state.size.set(1 / width, 1 / height, 1 / width, 1 / height));
        // Keep the bound matrix unchanged until this camera's next graph build.
        material.setProperty('taaPrevViewProj', state.valid ? state.previous.clone() : camera.matViewProj.clone());

        passContext.material = material;
        const blendedInput = this.lastPass!.slotName(camera, 0);
        const input = state.isolateTransparent ? this.opaqueSnapshot(state) : blendedInput;
        const history = state.valid ? this.historyName(state, state.output) : input;
        state.output = state.valid ? 1 - state.output : 0;
        passContext
            .addRenderPass(`DeferredTAA${state.output}`, `CameraTAAPass${cameraID}`)
            .setPassInput(input, 'inputTexture')
            .setPassInput(passContext.depthSlotName, 'depthTex')
            .setPassInput(history, 'taaPrevTexture')
            .addRasterView(this.historyName(state, state.output), Format.RGBA16F, true, ResourceResidency.PERSISTENT)
            .blitScreen(0)
            .version();
        if (state.isolateTransparent) {
            if (!state.compositeMaterial) state.compositeMaterial = new MaterialInstance({ parent: this.material });
            const composite = state.compositeMaterial;
            composite.setProperty('taaParams1', new Vec4(state.offset.x, state.offset.y, 0, 1));
            passContext.material = composite;
            passContext
                .addRenderPass('DeferredTAA0', `CameraTAAComposite${cameraID}`)
                .setPassInput(blendedInput, 'inputTexture')
                .setPassInput(input, 'depthTex')
                .setPassInput(this.historyName(state, state.output), 'taaPrevTexture')
                .addRasterView(this.compositeName(state), Format.RGBA16F)
                .blitScreen(0)
                .version();
        }
        state.previous.set(camera.matViewProj);
        state.valid = true;
    }
}
