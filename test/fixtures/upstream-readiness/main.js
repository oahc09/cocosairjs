import * as cc from 'cocosair';
import { observeAirFirstFrame } from '../../../tools/debug/readiness-observer.js';

const mode = new URLSearchParams(location.search).get('case') || 'cold';
if (!['cold', 'delayed-resource', 'offscreen', 'shader-failure', 'context-lost'].includes(mode))
    throw new Error('unknown readiness case');
const canvas = document.querySelector('canvas');
const nativeContext = canvas.getContext;
const restores = [];
let gl,
    currentProgram = null,
    drawPrograms = new Set(),
    drawCount = 0;
let faultResolve;
const fault = new Promise((resolve) => (faultResolve = resolve));
function hook(context) {
    const wrap = (name, before) => {
        const original = context[name];
        context[name] = function (...args) {
            before(...args);
            return original.apply(this, args);
        };
        restores.push(() => (context[name] = original));
    };
    const nativeCompile = context.compileShader;
    context.compileShader = function (shader) {
        nativeCompile.call(this, shader);
        const source = context.getShaderSource(shader) || '';
        if (mode === 'shader-failure' && source.includes('AIR_READINESS_NATIVE_UNDECLARED')) {
            const compiled = context.getShaderParameter(shader, context.COMPILE_STATUS);
            const log = context.getShaderInfoLog(shader);
            window.__readiness.shaderFault = {
                compiled,
                log,
                source,
                scope: 'native EffectAsset → Material → ProgramLib → WebGL2 shader compilation',
            };
            if (!compiled) faultResolve(new Error('native effect shader compilation failed: ' + log));
        }
    };
    restores.push(() => (context.compileShader = nativeCompile));
    wrap('useProgram', (program) => (currentProgram = program));
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'])
        wrap(name, () => {
            drawCount++;
            if (currentProgram) drawPrograms.add(currentProgram);
        });
}
canvas.getContext = function (type, ...args) {
    const context = nativeContext.call(this, type, ...args);
    if (type === 'webgl2' && context && !gl) {
        gl = context;
        hook(gl);
    }
    return context;
};
const onLost = () => faultResolve(new Error('actual webglcontextlost event'));
canvas.addEventListener('webglcontextlost', onLost);
const business = { animationTime: 0, physicsStep: 0, randomSeed: 12345, timers: 0, input: 0, businessEvents: 0 };
let submitResolve, passesResolve, presentResolve;
const submission = new Promise((resolve) => (submitResolve = resolve));
const passes = new Promise((resolve) => (passesResolve = resolve));
const presentation = new Promise((resolve) => (presentResolve = resolve));
let app,
    scene,
    resourceReady = false,
    submitted = false;
const engine = cc.createAirApp({ canvas, pixelRatioCap: 1 }).then((value) => (app = value));
const resources = engine.then(async () => {
    if (mode === 'delayed-resource') await new Promise((resolve) => setTimeout(resolve, 150));
    const response = await fetch('../upstream-skinning/rig.gltf');
    if (!response.ok) throw new Error(`fixture resource HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    const asset = await new cc.GLTFLoader().parseAsync(bytes);
    app.session.own(() => asset.destroy(), 'readiness-local-gltf');
    const instance = asset.instantiate();
    scene = new cc.Scene('readiness-fixture');
    scene.addChild(instance.root);
    // Native opaque control geometry gives a fixed, independently observable first-frame ROI.
    const node = new cc.Node('first-frame-control');
    scene.addChild(node);
    const renderer = node.addComponent(cc.MeshRenderer);
    const mesh = cc.utils.createMesh(cc.primitives.box({ width: 1, height: 1, length: 0.2 }));
    renderer.mesh = mesh;
    const material = new cc.Material();
    let faultyEffect, target;
    // Register before native initialization: a rejected shader may throw while construction is partial.
    app.session.own(() => {
        instance.dispose();
        target?.dispose();
        scene.destroy();
        material.destroy();
        faultyEffect?.destroy();
        mesh.destroy();
    }, 'readiness-scene-assets');
    if (mode === 'shader-failure') {
        faultyEffect = cc.createAirScreenEffect({
            name: 'upstream-readiness-native-fault',
            constants: ['faultControl'],
            body: 'void main () { cc_FragColor = AIR_READINESS_NATIVE_UNDECLARED; }',
        });
        // Normal native construction requests compilation; the observer never forces a lazy shader getter.
        material.initialize({ effectAsset: faultyEffect });
    } else {
        material.initialize({ effectName: 'builtin-unlit' });
        material.setProperty('mainColor', new cc.Color(240, 120, 30, 255));
    }
    renderer.setSharedMaterial(material, 0);
    const cameraNode = new cc.Node('Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(0, 0, 5);
    cameraNode.lookAt(new cc.Vec3());
    const camera = cameraNode.addComponent(cc.Camera);
    camera.clearFlags = cc.Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new cc.Color(8, 16, 32, 255);
    if (mode === 'offscreen') {
        target = cc.createAirRenderTarget({ width: 64, height: 64, depthFormat: 'depth24-stencil8', samples: 1 });
        const offNode = new cc.Node('Offscreen');
        scene.addChild(offNode);
        offNode.setPosition(0, 0, 5);
        offNode.lookAt(new cc.Vec3());
        const off = offNode.addComponent(cc.Camera);
        off.priority = -1;
        target.attachCamera(off);
    }
    resourceReady = true;
    if (mode === 'context-lost') {
        const extension = gl.getExtension('WEBGL_lose_context');
        if (!extension) {
            passesResolve({ status: 'unknown', details: 'WEBGL_lose_context unavailable' });
            return;
        }
        extension.loseContext();
    }
    app.run(scene);
    return { byteLength: bytes.byteLength, target: target?.info || null };
});
const beforeDraw = () => {
    if (!submitted) {
        drawPrograms = new Set();
        drawCount = 0;
    }
};
const afterDraw = () => {
    if (submitted || !resourceReady || app?.getScene() !== scene) return;
    submitted = true;
    const programs = [...drawPrograms].map((program) => ({
        linked: gl.getProgramParameter(program, gl.LINK_STATUS),
        log: gl.getProgramInfoLog(program),
    }));
    const receipt = {
        id: `${scene.uuid}:${cc.director.getTotalFrames()}`,
        scene: scene.uuid,
        frame: cc.director.getTotalFrames(),
        afterDraw: true,
    };
    window.__readiness.submission = receipt;
    const rgba = new Uint8Array(4);
    gl.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    window.__readiness.readback = Array.from(rgba);
    const details = { programs, drawCount, glError: gl.getError() };
    passesResolve({
        status:
            programs.length && drawCount
                ? programs.every((program) => program.linked) && details.glError === 0
                    ? 'available'
                    : 'failed'
                : 'unknown',
        details,
    });
    submitResolve(receipt);
};
cc.director.on(cc.Director.EVENT_BEFORE_DRAW, beforeDraw);
cc.director.on(cc.Director.EVENT_AFTER_DRAW, afterDraw);
window.__readiness = {
    mode,
    submission: null,
    readback: null,
    report: null,
    present(receipt) {
        presentResolve(receipt);
    },
    async close() {
        if (!app) return { absent: true };
        const release = await app.releaseScene();
        const close = await app.close();
        return { release, close };
    },
};
window.__readiness.completion = observeAirFirstFrame({
    engineCreated: engine,
    resources: [{ name: 'fixed-local-gltf-and-scene', promise: resources }],
    inspectPasses: () => passes,
    waitForSubmission: () => submission,
    waitForPresentation: () => presentation,
    snapshotBusiness: () => business,
    timeoutMs: 15000,
    fault,
    cleanup() {
        cc.director.off(cc.Director.EVENT_BEFORE_DRAW, beforeDraw);
        cc.director.off(cc.Director.EVENT_AFTER_DRAW, afterDraw);
        canvas.removeEventListener('webglcontextlost', onLost);
        canvas.getContext = nativeContext;
        for (const restore of restores) restore();
    },
}).then((report) => (window.__readiness.report = report));
