#!/usr/bin/env node
'use strict';

const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { resolve } = require('node:path');
const vm = require('node:vm');

const renderPaths = {
    taa: 'src/cocos/rendering/post-process/passes/taa-pass.ts',
    builder: 'src/cocos/rendering/post-process/post-process-builder.ts',
};

function probe(root) {
    // Execute both real classes. Fake the math and resource/descriptor layers, not the TAA scheduling logic.
    const ts = require('typescript');
    const hashes = {};
    function load(key, imports) {
        const source = readFileSync(resolve(root, renderPaths[key]), 'utf8');
        hashes[key] = createHash('sha256').update(source).digest('hex');
        const js = ts.transpileModule(source, {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        }).outputText;
        const exports = {};
        const linkedRequire = (name) => {
            if (!Object.hasOwn(imports, name)) throw new Error(`Unmodeled ${key} dependency: ${name}`);
            return imports[name];
        };
        vm.runInNewContext(js, { exports, require: linkedRequire }, { filename: renderPaths[key], timeout: 1000 });
        return exports;
    }

    class Vec {
        constructor(x = 0, y = 0, z = 0, w = 0) {
            this.set(x, y, z, w);
        }

        set(x, y, z, w) {
            Object.assign(this, { x, y, z, w });
            return this;
        }

        static set(target, ...args) {
            target.set(...args);
        }
    }
    Vec.ZERO = new Vec();
    class Mat4 {
        set(m) {
            Object.assign(this, m);
        }

        static invert() {}

        static multiply(out, proj, view) {
            out.set({ owner: view.owner, frame: view.frame, jitterX: proj.m12, jitterY: proj.m13 });
        }
    }
    class Material {
        values = {};

        setProperty(key, value) {
            this.values[key] = structuredClone(value);
        }
    }
    class BasePass {}
    class SettingPass extends BasePass {
        material = new Material();

        checkEnable() {
            return true;
        }

        slotName(camera, index) {
            return this.outputNames[index] + ':' + camera.id;
        }
    }

    const drawList = [];
    let draw;
    const passContext = {
        clearColor: new Vec(),
        depthSlotName: 'depth',
        viewport: { width: 240, height: 160 },
        passViewport: { width: 240, height: 160 },
        updateViewPort() {},
        updatePassViewPort() {},
        addRenderPass(layout) {
            draw = { camera: this.camera.id, frame: this.camera.frame, layout, inputs: {} };
            drawList.push(draw);
            return this;
        },
        setPassInput(name, binding) {
            draw.inputs[binding] = name;
            return this;
        },
        addRasterView(name) {
            draw.output = name;
            return this;
        },
        blitScreen() {
            // A queued WebPipeline Blit holds the material, not a snapshot of its constants.
            draw.material = this.material;
            draw.atEnqueue = structuredClone(this.material.values);
            draw.projection = structuredClone(this.camera.matViewProj);
            return this;
        },
        version() {},
    };
    const flags = { EDITOR: false };
    const cameraID = { getCameraUniqueID: (camera) => camera.id };
    const context = { passContext };
    const settings = { sampleScale: 1, feedback: 0.95 };
    const { TAAPass } = load('taa', {
        'internal:constants': flags,
        '../../../core': { Mat4, Vec2: Vec, Vec4: Vec },
        '../../../game': { game: { canvas: { width: 400, height: 300 } } },
        '../../../gfx': { ClearFlagBit: { COLOR: 1 }, Format: { RGBA16F: 1 } },
        '../../../render-scene/scene': { CameraUsage: {} },
        '../../custom/types': { ResourceResidency: { PERSISTENT: 1 } },
        '../../custom/define': cameraID,
        '../components/taa': { TAA: class {} },
        '../components/taa-mask': { TAAMask: class {} },
        '../utils/pass-context': context,
        './base-pass': { disablePostProcessForDebugView: () => false },
        './setting-pass': { SettingPass, getSetting: () => settings },
        '../../../asset/asset-manager': { builtinResMgr: { get: () => null } },
        '../../../asset/assets': { Material },
        '../../../render-scene': { MaterialInstance: Material },
    });
    function inert(name) {
        return class extends BasePass {
            name = name;
        };
    }
    const { PostProcessBuilder } = load('builder', {
        'internal:constants': flags,
        '../../render-scene/scene': { CameraUsage: {}, CameraProjection: {} },
        './utils/pass-context': context,
        '../custom/define': cameraID,
        './passes/taa-pass': { TAAPass },
        './passes/forward-final-pass': { ForwardFinalPass: inert('ForwardFinalPass') },
        './passes/forward-pass': { ForwardPass: inert('ForwardPass') },
        './passes/fsr-pass': { FSRPass: inert('FSRPass') },
        './passes/blit-screen-pass': { BlitScreenPass: inert('BlitScreenPass') },
        './passes/shadow-pass': { ShadowPass: inert('ShadowPass') },
        './passes/hbao-pass': { HBAOPass: inert('HBAOPass') },
        './passes': Object.fromEntries(
            [
                'BloomPass',
                'ColorGradingPass',
                'DofPass',
                'FloatOutputProcessPass',
                'ForwardTransparencyPass',
                'ForwardTransparencySimplePass',
                'FxaaPass',
                'PostFinalPass',
                'SkinPass',
            ].map((name) => [name, inert(name)]),
        ),
        './components/post-process': {},
        '../../game': {},
        '../../misc': {},
        '../pipeline-event': {},
    });

    const builder = new PostProcessBuilder();
    const taa = builder.getPass(TAAPass);
    const forward = { checkEnable: () => true, slotName: (camera) => 'current:' + camera.id, render() {} };
    builder.pipelines.set('forward', [forward, taa]);

    function makeCamera(id) {
        return {
            id,
            frame: 0,
            usePostProcess: true,
            node: { getComponent: () => null },
            matProj: {},
            matProjInv: {},
            matView: {},
            matViewProj: new Mat4(),
            matViewProjInv: new Mat4(),
            frustum: { update() {} },
            window: { width: 240, height: 160 },
            update() {
                Object.assign(this.matView, { owner: this.id, frame: this.frame });
                Object.assign(this.matProj, { m12: 0, m13: 0 });
                Mat4.multiply(this.matViewProj, this.matProj, this.matView);
            },
        };
    }

    const cameras = [makeCamera('A'), makeCamera('B')];
    const lastWrite = new Map();
    const records = [];
    function xy(v) {
        return [v.x, v.y];
    }
    function matrixTag(m) {
        return [m.owner, m.frame, m.jitterX, m.jitterY];
    }
    function same(a, b) {
        return a.length === b.length && a.every((v, i) => v === b[i]);
    }
    for (let frame = 0; frame < 3; frame++) {
        drawList.length = 0;
        for (const camera of cameras) {
            camera.frame = frame;
            builder.renderCamera(camera, {});
        }
        for (const d of drawList) {
            const previous = lastWrite.get(d.camera);
            const expectedRead = previous?.output ?? d.inputs.inputTexture;
            const expectedMatrix = previous?.projection ?? d.projection;
            const applied = [d.projection.jitterX, d.projection.jitterY];
            const queued = d.atEnqueue;
            const deferred = d.material.values;
            records.push({
                camera: d.camera,
                frame,
                history: d.inputs.taaPrevTexture,
                output: d.output,
                expectedHistory: expectedRead,
                expectedPreviousMatrix: matrixTag(expectedMatrix),
                previousMatrix: matrixTag(queued.taaPrevViewProj),
                deferredPreviousMatrix: matrixTag(deferred.taaPrevViewProj),
                appliedJitter: applied,
                enqueuedJitter: xy(queued.taaParams1),
                deferredJitter: xy(deferred.taaParams1),
                historyCorrect: d.inputs.taaPrevTexture === expectedRead && d.output !== expectedRead,
                previousMatrixCorrect: same(matrixTag(queued.taaPrevViewProj), matrixTag(expectedMatrix)),
                appliedJitterCorrect: same(applied, xy(queued.taaParams1)),
                bindingsStable:
                    same(matrixTag(queued.taaPrevViewProj), matrixTag(deferred.taaPrevViewProj)) &&
                    same(xy(queued.taaParams1), xy(deferred.taaParams1)),
            });
            lastWrite.set(d.camera, d);
        }
    }

    const keys = ['historyCorrect', 'previousMatrixCorrect', 'appliedJitterCorrect', 'bindingsStable'];
    const failures = Object.fromEntries(keys.map((key) => [key, records.filter((o) => !o[key]).length]));
    const complete =
        records.length === 6 && cameras.every((c) => records.filter((r) => r.camera === c.id).length === 3);
    return { mode: 'source-executed-stub-graph', hashes, complete, failures, records };
}

if (require.main === module) {
    const report = probe(resolve(__dirname, '../../..'));
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (!report.complete || Object.values(report.failures).some(Boolean)) process.exitCode = 1;
}

module.exports = { probe };
