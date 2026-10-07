import * as cc from 'cocosair';

let startupCode;
try {
    cc.utils.MeshUtils.createDynamicMesh(0, {
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        indices16: new Uint16Array([0, 1, 2]),
    });
} catch (error) {
    startupCode = error.code;
}

// Only native public APIs. Every capture is made before retirement and inside
// the same synchronous tick/readback operation. The runner judges the pixels.
const app = await cc.createAirApp({ canvas: '#GameCanvas', diagnostics: 'warnings' });
const scene = new cc.Scene('K0R2Rendering');
const cn = new cc.Node('camera');
scene.addChild(cn);
cn.setPosition(0, 0, 5);
const camera = cn.addComponent(cc.Camera);
camera.projection = cc.Camera.ProjectionType.ORTHO;
camera.orthoHeight = 2;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = cc.Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new cc.Color(0, 0, 0, 255);
scene.globals.ambient.skyColor = new cc.Vec4(0.6, 0.6, 0.6, 1);
const ln = new cc.Node('main-light');
scene.addChild(ln);
ln.setRotationFromEuler(-35, -25, 0);
ln.addComponent(cc.DirectionalLight).illuminance = 65000;
app.run(scene);
cc.game.pause();
const gl = app.canvas.getContext('webgl2');
const owned = [],
    groups = [],
    renderers = [],
    instances = [],
    parsed = [];
const own = (asset) => {
    asset.addRef();
    owned.push({ asset, initial: asset.refCount });
    return asset;
};
const P = [-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0];
const N = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    UV = [0, 0, 1, 0, 0, 1, 1, 1],
    I = [0, 1, 2, 1, 3, 2];
const colors = Array.from({ length: 4 }, () => [1, 0, 0, 1]).flat();
function group(name) {
    const n = new cc.Node(name);
    scene.addChild(n);
    groups.push(n);
    n.active = false;
    return n;
}
function mesh(extra = {}) {
    return own(cc.utils.MeshUtils.createMesh({ positions: P, normals: N, uvs: UV, indices: I, ...extra }));
}
function mat(defines = {}, color = new cc.Color(255, 255, 255, 255), states) {
    const m = own(new cc.Material());
    m.initialize({ effectName: 'builtin-unlit', defines, states });
    m.setProperty('mainColor', color);
    return m;
}
function quad(host, geometry, material, name = 'quad') {
    const node = new cc.Node(name);
    host.addChild(node);
    const r = node.addComponent(cc.MeshRenderer);
    r.mesh = geometry;
    r.setSharedMaterial(material, 0);
    renderers.push(r);
    return { node, r, mesh: geometry, material };
}
function texture(bytes) {
    const t = own(new cc.Texture2D());
    t.reset({ width: 2, height: 2, format: cc.Texture2D.PixelFormat.RGBA8888 });
    t.setFilters(cc.Texture2D.Filter.NEAREST, cc.Texture2D.Filter.NEAREST);
    t.uploadData(new Uint8Array(bytes));
    return t;
}
function inspect(q) {
    return cc.inspectAirMeshMaterial?.(q.mesh, q.material, 0, q.r) ?? null;
}
function capture(extra = {}) {
    cc.director.tick(0);
    const w = app.canvas.width,
        h = app.canvas.height,
        data = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
    const px = (x, y) =>
        Array.from(data.slice((Math.floor(y) * w + Math.floor(x)) * 4, (Math.floor(y) * w + Math.floor(x)) * 4 + 4));
    return {
        ...extra,
        width: w,
        height: h,
        glError: gl.getError(),
        center: px(w / 2, h / 2),
        corner: px(2, 2),
        png: app.canvas.toDataURL(),
    };
}
function show(g) {
    for (const n of groups) n.active = n === g;
}

const vertexG = group('vertex'),
    vertex = quad(vertexG, mesh({ colors }), mat({ USE_VERTEX_COLOR: true }));
const vertexOff = mat({ USE_VERTEX_COLOR: false });
const uvG = group('uv'),
    noUV = quad(uvG, mesh({ uvs: undefined }), mat({ USE_TEXTURE: true }));
const tex = texture([0, 0, 0, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255]);
const opaqueTex = texture(Array.from({ length: 4 }, () => [0, 255, 0, 255]).flat());
noUV.material.setProperty('mainTexture', tex);
const withUV = mesh({ uvs: [0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75] });
const blendG = group('blend'),
    back = quad(blendG, mesh(), mat({}, new cc.Color(0, 255, 0, 255)), 'back');
const alphaStates = {
    depthStencilState: { depthTest: true, depthWrite: false },
    blendState: {
        targets: [
            {
                blend: true,
                blendEq: cc.gfx.BlendOp.ADD,
                blendSrc: cc.gfx.BlendFactor.SRC_ALPHA,
                blendDst: cc.gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                blendAlphaEq: cc.gfx.BlendOp.ADD,
                blendSrcAlpha: cc.gfx.BlendFactor.ONE,
                blendDstAlpha: cc.gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
            },
        ],
    },
};
const addStates = {
    ...alphaStates,
    blendState: { targets: [{ ...alphaStates.blendState.targets[0], blendDst: cc.gfx.BlendFactor.ONE }] },
};
const front = quad(blendG, mesh(), mat({}, new cc.Color(255, 0, 0, 128), alphaStates), 'front');
front.node.setPosition(0, 0, 0.1);
const alpha = front.material,
    additive = mat({}, new cc.Color(255, 0, 0, 128), addStates),
    opaque = mat({}, new cc.Color(255, 0, 0, 255));

const nativeG = group('native');
const DP = new Float32Array(P),
    DN = new Float32Array(N),
    DU = new Float32Array(UV),
    DI = new Uint16Array(I);
const dynamic = own(
    cc.utils.MeshUtils.createDynamicMesh(0, { positions: DP, normals: DN, uvs: DU, indices16: DI }, undefined, {
        maxSubMeshes: 1,
        maxSubMeshVertices: 4,
        maxSubMeshIndices: 6,
    }),
);
const dq = quad(nativeG, dynamic, mat({}, new cc.Color(255, 0, 0, 255)));
const reversed = new Uint16Array([0, 2, 1, 1, 2, 3]);
const noCull = mat({}, new cc.Color(255, 0, 0, 255), { rasterizerState: { cullMode: cc.gfx.CullMode.NONE } });
const largeG = group('large');
const lp = new Float32Array(4096 * 3),
    li = new Uint32Array(63 * 63 * 6);
for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
        let a = y * 64 + x;
        lp[a * 3] = x / 63 - 0.5;
        lp[a * 3 + 1] = y / 63 - 0.5;
    }
let ix = 0;
for (let y = 0; y < 63; y++)
    for (let x = 0; x < 63; x++) {
        let a = y * 64 + x;
        for (const v of [a, a + 1, a + 64, a + 1, a + 65, a + 64]) li[ix++] = v;
    }
const large = own(
    cc.utils.MeshUtils.createDynamicMesh(0, { positions: lp, indices32: li }, undefined, {
        maxSubMeshes: 1,
        maxSubMeshVertices: 4096,
        maxSubMeshIndices: li.length,
    }),
);
quad(largeG, large, mat({}, new cc.Color(255, 0, 0, 255)));
const fogG = group('fog');
let fogEffect = null,
    fogQ = null;
if (cc.createAirUnlitFogEffect) {
    fogEffect = own(cc.createAirUnlitFogEffect());
    const m = own(new cc.Material());
    m.initialize({ effectAsset: fogEffect });
    m.setProperty('mainColor', new cc.Color(255, 0, 0, 255));
    fogQ = quad(fogG, mesh(), m);
}
const scaleG = group('scale'),
    scale = quad(scaleG, mesh(), mat({}, new cc.Color(255, 0, 0, 255)));
const instancedG = group('instanced'),
    instanced = quad(instancedG, mesh(), mat({ USE_INSTANCING: true }, new cc.Color(255, 0, 0, 255)));
const billG = group('billboard'),
    billNode = new cc.Node('bill');
billG.addChild(billNode);
const bill = billNode.addComponent(cc.Billboard);
bill.width = 1;
bill.height = 1;
bill.texture = opaqueTex;

let foxAsset = null,
    fa = null,
    fb = null,
    foxRenderers = [],
    clipName = '',
    finished = 0,
    originalWrap = [];
async function loadFox() {
    if (foxAsset) return;
    const url = new URL('/examples/gltf-viewer/assets/official/Fox.glb', location.href).href;
    foxAsset = await new cc.GLTFLoader().parseAsync(await (await fetch(url)).arrayBuffer(), url);
    own(foxAsset);
    parsed.push(foxAsset);
    fa = foxAsset.instantiate();
    fb = foxAsset.instantiate();
    instances.push(fa, fb);
    fa.root.setScale(0.012, 0.012, 0.012);
    fb.root.setScale(0.012, 0.012, 0.012);
    fa.root.setPosition(-0.9, -0.7, 0);
    fb.root.setPosition(0.9, -0.7, 0);
    const g = group('fox');
    g.addChild(fa.root);
    g.addChild(fb.root);
    foxAsset.g = g;
    foxRenderers = fa.root.getComponentsInChildren(cc.SkinnedMeshRenderer);
    clipName = foxAsset.animations[0].name;
    originalWrap = foxAsset.animations.map((c) => c.wrapMode);
    fa.setAnimationLoop?.(true, clipName);
    // Native controller already attached by instantiate, no second Animation.
    fb.root.getComponent(cc.Animation).on(cc.Animation.EventType.FINISHED, () => finished++);
}
function pose(root) {
    const a = [];
    root.walk((n) =>
        a.push(...[n.position.x, n.position.y, n.position.z, n.rotation.x, n.rotation.y, n.rotation.z, n.rotation.w]),
    );
    return a;
}
function animationState() {
    const aa = fa.root.getComponent(cc.Animation),
        ba = fb.root.getComponent(cc.Animation);
    const a = aa.getState(clipName),
        b = ba.getState(clipName);
    return {
        duration: foxAsset.animations[0].duration,
        clip: clipName,
        sourceWrap: foxAsset.animations.map((c) => c.wrapMode),
        originalWrap,
        a: { time: a.time, playing: a.isPlaying, wrap: a.wrapMode, pose: pose(fa.root) },
        b: { time: b.time, playing: b.isPlaying, wrap: b.wrapMode, pose: pose(fb.root) },
        finished,
        sharedClip: fa.animations[0] === fb.animations[0],
        controllers: [fa.root.getComponents(cc.Animation).length, fb.root.getComponents(cc.Animation).length],
        materials: foxRenderers.map((r) => ({
            effect: r.getSharedMaterial(0).effectName,
            passes: r.model?.subModels.map((s) => ({
                attributes: s.shaders?.[0]?.attributes?.map((a) => a.name) ?? [],
            })),
        })),
    };
}

window.__k0r2Materials = {
    async run(name) {
        // Disable fog between groups, preserve shared resources until final close.
        const fog = cc.director.root.pipeline.pipelineSceneData.fog;
        fog.enabled = false;
        if (name.startsWith('vertex')) {
            show(vertexG);
            vertex.r.setSharedMaterial(name === 'vertex-off' ? vertexOff : vertex.material, 0);
            const image = capture();
            return { ...image, inspection: inspect({ ...vertex, material: vertex.r.getSharedMaterial(0) }) };
        }
        if (name.startsWith('uv-')) {
            show(uvG);
            noUV.r.mesh = name === 'uv-present' ? withUV : noUV.mesh;
            noUV.material.setProperty('mainTexture', name === 'uv-missing-opaque' ? opaqueTex : tex);
            return capture({ inspection: inspect({ ...noUV, mesh: noUV.r.mesh }) });
        }
        if (name.startsWith('blend-')) {
            show(blendG);
            front.node.active = name !== 'blend-background';
            front.r.setSharedMaterial(name === 'blend-add' ? additive : name === 'blend-opaque' ? opaque : alpha, 0);
            return capture({
                passStates: front.r.getSharedMaterial(0).passes.map((p) => ({
                    blend: p.blendState.targets[0].blend,
                    depthWrite: p.depthStencilState.depthWrite,
                })),
            });
        }
        if (name === 'large') {
            show(largeG);
            return capture({
                vertices: large.struct.dynamic.info.maxSubMeshVertices,
                indexCount: large.renderingSubMeshes[0].drawInfo.indexCount,
            });
        }
        if (name === 'mesh-startup') {
            show(scaleG);
            return capture({
                startupCode,
                initializedMeshIndexCount: dynamic.renderingSubMeshes[0].drawInfo.indexCount,
            });
        }
        if (name.startsWith('mesh-') || name.startsWith('cull-')) {
            show(nativeG);
            dq.node.setScale(1, 1, 1);
            dq.r.setSharedMaterial(dq.material, 0);
            dynamic.updateSubMesh(0, { positions: DP, indices16: DI });
            const before = {
                indices: [...dynamic.readIndices(0)],
                uv: [...dynamic.readAttribute(0, cc.gfx.AttributeName.ATTR_TEX_COORD)],
                normals: [...dynamic.readAttribute(0, cc.gfx.AttributeName.ATTR_NORMAL)],
            };
            let detail = {};
            if (name === 'mesh-partial') {
                const moved = DP.slice();
                for (let i = 0; i < moved.length; i += 3) moved[i] += 1;
                for (let i = 0; i < 100; i++) dynamic.updateSubMesh(0, { positions: moved });
                detail = {
                    before,
                    after: {
                        indices: [...dynamic.readIndices(0)],
                        uv: [...dynamic.readAttribute(0, cc.gfx.AttributeName.ATTR_TEX_COORD)],
                        normals: [...dynamic.readAttribute(0, cc.gfx.AttributeName.ATTR_NORMAL)],
                    },
                    minX: dynamic.struct.minPosition.x,
                    maxX: dynamic.struct.maxPosition.x,
                };
            }
            if (name === 'mesh-empty') {
                dynamic.updateSubMesh(0, { indices16: new Uint16Array(0) });
                detail.unnotifiedIndexCount = dq.r.model.subModels[0].inputAssembler.drawInfo.indexCount;
            }
            if (name === 'cull-back') dynamic.updateSubMesh(0, { indices16: reversed });
            if (name === 'cull-negative' || name === 'cull-none') dq.node.setScale(-1, 1, 1);
            if (name === 'cull-none') dq.r.setSharedMaterial(noCull, 0);
            // Native mesh data and model draw/bounds are separate objects.
            // Notify every renderer using a changed mesh, including empty indices.
            dq.r.onGeometryChanged();
            return capture({
                ...detail,
                indexCount: dynamic.renderingSubMeshes[0].drawInfo.indexCount,
                assemblerIndexCount: dq.r.model.subModels[0].inputAssembler.drawInfo.indexCount,
            });
        }
        if (name.startsWith('fog-')) {
            show(fogG);
            fog.enabled = false;
            fog.type = cc.FogInfo.FogType.LINEAR;
            fog.fogStart = 0;
            fog.fogEnd = 8;
            fog.fogColor = new cc.Color(0, 0, 255, 255);
            if (name === 'fog-enabled-first') {
                fog.enabled = true;
                fog.type = cc.FogInfo.FogType.LINEAR;
            } else fog.enabled = name === 'fog-on';
            return capture({ type: fog.type, enabled: fog.enabled });
        }
        if (name.startsWith('scale-')) {
            show(scaleG);
            scale.node.setScale(name === 'scale-double' ? 2 : 1, name === 'scale-double' ? 2 : 1, 1);
            return capture();
        }
        if (name.startsWith('instance-')) {
            show(instancedG);
            instanced.node.setScale(name === 'instance-double' ? 2 : 1, name === 'instance-double' ? 2 : 1, 1);
            const result = capture();
            return { ...result, instancingEnabled: instanced.r.model?.subModels[0].passes[0].defines.USE_INSTANCING };
        }
        if (name.startsWith('bill-')) {
            show(billG);
            billNode.setScale(name === 'bill-node-scale' ? 3 : 1, name === 'bill-node-scale' ? 3 : 1, 1);
            bill.width = name === 'bill-width' ? 2 : 1;
            bill.height = name === 'bill-width' ? 2 : 1;
            return capture({ width: bill.width, height: bill.height, nodeScale: [billNode.scale.x, billNode.scale.y] });
        }
        if (name === 'coordinates') {
            show(scaleG);
            scale.node.setScale(1, 1, 1);
            camera.rect = new cc.Rect(0.2, 0.1, 0.6, 0.7);
            cc.director.tick(0);
            const rect = app.canvas.getBoundingClientRect(),
                w = app.canvas.width,
                h = app.canvas.height;
            const points = [
                [-0.5, -0.5, 0],
                [0.5, 0.5, 0],
                [0, 0, 0],
            ].map((a) => {
                const v = new cc.Vec3(...a),
                    s = camera.worldToScreen(v),
                    back = camera.screenToWorld(s);
                return {
                    world: a,
                    screen: [s.x, s.y, s.z],
                    roundTrip: [back.x, back.y, back.z],
                    client: [rect.left + (s.x * rect.width) / w, rect.top + ((h - s.y) * rect.height) / h],
                };
            });
            const r = {
                width: w,
                height: h,
                dpr: devicePixelRatio,
                rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                viewport: [0.2, 0.1, 0.6, 0.7],
                points,
            };
            camera.rect = new cc.Rect(0, 0, 1, 1);
            return r;
        }
        if (name === 'lights') {
            show(scaleG);
            const others = [new cc.Node('extra-a'), new cc.Node('extra-b')];
            others.forEach((n) => {
                scene.addChild(n);
                n.addComponent(cc.DirectionalLight);
            });
            const first = cc.inspectAirDirectionalLights(scene);
            const active = first.lights.find((l) => l.effective);
            const selected = [ln, ...others].find((n) => n.uuid === active.node);
            selected.getComponent(cc.DirectionalLight).enabled = false;
            const disabled = cc.inspectAirDirectionalLights(scene);
            const next = [ln, ...others].find((n) => n.uuid === disabled.mainLight);
            next.removeFromParent();
            const removed = cc.inspectAirDirectionalLights(scene);
            next.destroy();
            for (const n of others) if (n !== next) n.destroy();
            if (ln !== next) ln.getComponent(cc.DirectionalLight).enabled = true;
            return capture({ first, disabled, removed });
        }
        if (name.startsWith('fox-')) {
            await loadFox();
            show(foxAsset.g);
            if (name === 'fox-default') return capture({ state: animationState(), skinnedCount: foxRenderers.length });
            if (name === 'fox-scaled') {
                fb.root.active = false;
                fa.root.setPosition(0, -0.7, 0);
                fa.root.setScale(0.024, 0.024, 0.024);
                return capture({ skinnedCount: foxRenderers.length });
            }
            if (name === 'fox-single') {
                fb.root.active = false;
                fa.root.setPosition(0, -0.7, 0);
                fa.root.setScale(0.012, 0.012, 0.012);
                return capture({ skinnedCount: foxRenderers.length });
            }
            if (name === 'fox-loop') {
                fb.root.active = true;
                fa.root.setPosition(-0.9, -0.7, 0);
                fa.root.setScale(0.012, 0.012, 0.012);
                const aa = fa.root.getComponent(cc.Animation),
                    ba = fb.root.getComponent(cc.Animation);
                aa.play(clipName);
                ba.play(clipName);
                cc.director.tick(0);
                const d = foxAsset.animations[0].duration;
                for (let i = 0; i < Math.ceil(d * 2.5 * 60); i++) cc.director.tick(1 / 60);
                const first = animationState();
                for (let i = 0; i < 17; i++) cc.director.tick(1 / 60);
                return capture({ first, second: animationState() });
            }
            if (name === 'fox-controller-overlap') {
                const second = fa.root.addComponent(cc.Animation);
                second.clips = fa.animations.slice();
                second.playOnLoad = false;
                const inspection = cc.inspectAirAnimationControllers(fa.root);
                const image = capture();
                return { ...image, inspection, diagnostics: app.diagnostics.snapshot() };
            }
        }
        throw Error('Unknown case ' + name);
    },
    async close() {
        for (const r of renderers) {
            r.setSharedMaterial(null, 0);
            r.mesh = null;
        }
        bill.texture = null;
        for (const instance of instances) instance.dispose();
        cc.director.tick(0);
        await Promise.resolve();
        cc.director.tick(0);
        const refs = owned.map(({ asset, initial }) => ({
            type: asset.constructor.name,
            before: asset.refCount,
            initial,
        }));
        for (let i = owned.length - 1; i >= 0; i--) owned[i].asset.decRef();
        refs.forEach((r, i) => (r.after = owned[i].asset.refCount));
        if (fogEffect) cc.EffectAsset.remove(fogEffect);
        const receipt = await app.close();
        return {
            refs,
            receipt,
            nodes: groups.map((n) => ({ name: n.name, valid: n.isValid })),
            parsed: parsed.map((a) => ({ valid: a.isValid, refCount: a.refCount })),
        };
    },
};
