import * as cc from '/build/cocosair.module.js';
const app = await cc.createAirApp({ canvas: '#GameCanvas', diagnostics: 'warnings' });
const scene = new cc.Scene('EngineContracts');
const cameraNode = new cc.Node('Camera');
cameraNode.setPosition(0, 0, 5);
scene.addChild(cameraNode);
const camera = cameraNode.addComponent(cc.Camera);
camera.projection = cc.Camera.ProjectionType.ORTHO;
camera.orthoHeight = 2;
camera.near = 0.1;
camera.far = 30;
camera.clearFlags = cc.Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new cc.Color(16, 19, 27, 255);
const positions = new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]);
const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
const uvs = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
const colors = new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]);
const indices16 = new Uint16Array([0, 1, 2, 1, 3, 2]);
const mesh = cc.utils.MeshUtils.createDynamicMesh(0, { positions, normals, uvs, colors, indices16 }, undefined, {
    maxSubMeshes: 1,
    maxSubMeshVertices: 4,
    maxSubMeshIndices: 6,
});
const node = new cc.Node('Quad');
scene.addChild(node);
const renderer = node.addComponent(cc.MeshRenderer);
renderer.mesh = mesh;
const material = new cc.Material();
material.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true } });
renderer.setSharedMaterial(material, 0);
app.run(scene);
const clock = cc.createStepClock();
clock.begin();
await clock.step(0);
const owned = [material],
    fogEffect = cc.createAirUnlitFogEffect();
const replacement = (defines, states) => {
    const next = new cc.Material();
    next.initialize({ effectName: 'builtin-unlit', defines, states });
    owned.push(next);
    renderer.setSharedMaterial(next, 0);
    return next;
};
window.__engineContracts = {
    snapshot() {
        const gl = app.canvas.getContext('webgl2'),
            pixel = new Uint8Array(4);
        gl.readPixels(app.canvas.width >> 1, app.canvas.height >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        return {
            pixel: [...pixel],
            error: gl.getError(),
            indices: [...mesh.readIndices(0)],
            uv: [...mesh.readAttribute(0, cc.gfx.AttributeName.ATTR_TEX_COORD)],
            normals: [...mesh.readAttribute(0, cc.gfx.AttributeName.ATTR_NORMAL)],
            material: cc.inspectAirMeshMaterial(mesh, renderer.getSharedMaterial(0), 0, renderer),
            geometry: cc.inspectAirGeometry(mesh, node, renderer.getSharedMaterial(0)),
            diagnostics: app.diagnostics.snapshot(),
            paused: app.contextHealth.snapshot().gamePaused,
        };
    },
    frame: () => clock.step(0),
    green() {
        const data = colors.slice();
        for (let i = 0; i < 4; i++) {
            data[i * 4] = 0;
            data[i * 4 + 1] = 1;
        }
        mesh.updateSubMesh(0, { colors: data });
    },
    uvOnly() {
        mesh.updateSubMesh(0, { uvs: new Float32Array([0.25, 0.25, 0.75, 0.25, 0.25, 0.75, 0.75, 0.75]) });
    },
    invalid() {
        const before = mesh.data.slice();
        let code;
        try {
            mesh.updateSubMesh(0, { positions: positions.slice(), indices16: new Uint16Array([0, 1, 99]) });
        } catch (e) {
            code = e.code;
        }
        return { code, unchanged: before.every((v, i) => v === mesh.data[i]) };
    },
    vertexOff() {
        replacement({ USE_VERTEX_COLOR: false });
    },
    negative() {
        node.setScale(-1, 1, 1);
    },
    noCull() {
        replacement({ USE_VERTEX_COLOR: true }, { rasterizerState: { cullMode: cc.gfx.CullMode.NONE } });
    },
    fog(on) {
        node.setScale(1, 1, 1);
        const m = new cc.Material();
        m.initialize({ effectAsset: fogEffect, defines: { USE_VERTEX_COLOR: true } });
        owned.push(m);
        renderer.setSharedMaterial(m, 0);
        const fog = cc.director.root.pipeline.pipelineSceneData.fog;
        fog.enabled = false;
        fog.type = cc.FogInfo.FogType.LINEAR;
        fog.fogStart = 0;
        fog.fogEnd = 4;
        fog.fogColor = new cc.Color(0, 0, 255, 255);
        fog.enabled = on;
        return { type: fog.type, macro: cc.director.root.pipeline.macros.CC_USE_FOG };
    },
    lights() {
        const a = new cc.Node('light-a'),
            b = new cc.Node('light-b');
        scene.addChild(a);
        scene.addChild(b);
        a.addComponent(cc.DirectionalLight);
        b.addComponent(cc.DirectionalLight);
        const first = cc.inspectAirDirectionalLights(scene),
            selected = first.lights.find((l) => l.effective);
        (selected.node === a.uuid ? a : b).getComponent(cc.DirectionalLight).enabled = false;
        return { first, after: cc.inspectAirDirectionalLights(scene) };
    },
    badScale() {
        const before = node.getWorldMatrix().clone();
        let code;
        try {
            node.setScale([2, 2, 2]);
        } catch (e) {
            code = e.code;
        }
        return { code, unchanged: cc.Mat4.equals(before, node.getWorldMatrix()) };
    },
    dispose: async () => {
        for (const m of owned) m.destroy();
        cc.EffectAsset.remove(fogEffect);
        fogEffect.destroy();
        mesh.destroy();
        return app.close();
    },
};
