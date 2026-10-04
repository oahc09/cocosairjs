import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Color,
    Material,
    MeshRenderer,
    Layers,
    utils,
    primitives,
    gfx,
    game,
    director,
} from 'cocosair';
import { createAgentSession } from '../../../tools/debug/agent-session';
const app = await createAirApp({ canvas: '#GameCanvas', diagnostics: 'warnings' }),
    gl = app.canvas.getContext('webgl2')!,
    scene = new Scene('Visibility');
const cn = new Node('MainCamera'),
    clearNode = new Node('ClearCamera');
scene.addChild(cn);
scene.addChild(clearNode);
cn.setPosition(0, 0, 10);
clearNode.setPosition(0, 0, 10);
const camera = cn.addComponent(Camera),
    clear = clearNode.addComponent(Camera);
for (const c of [camera, clear]) {
    c.projection = Camera.ProjectionType.ORTHO;
    c.orthoHeight = 4;
    c.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    c.clearColor = new Color(0, 0, 0, 255);
}
clear.priority = -10;
clear.visibility = 0;
const node = new Node('VisibleMesh');
scene.addChild(node);
const renderer = node.addComponent(MeshRenderer),
    mesh = utils.createMesh(primitives.quad({ includeNormal: true, includeUV: true })),
    material = new Material();
material.initialize({ effectName: 'builtin-unlit', states: { rasterizerState: { cullMode: gfx.CullMode.NONE } } });
material.setProperty('mainColor', new Color(255, 0, 0, 255));
renderer.mesh = mesh;
renderer.setSharedMaterial(material, 0);
app.run(scene);
game.pause();
director.tick(0);
const session = createAgentSession({ app });
const id = session.inspectScene().nodes.find((v) => v.name === 'VisibleMesh')!.id;
function count() {
    const data = new Uint8Array(app.canvas.width * app.canvas.height * 4);
    gl.readPixels(0, 0, app.canvas.width, app.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > 180 && data[i + 1] < 30 && data[i + 2] < 30) n++;
    return n;
}
function run() {
    const cases: any[] = [],
        baseLayer = node.layer,
        baseVisibility = renderer.visibility,
        baseMask = camera.visibility;
    const observe = (kind: string) => {
        director.tick(0);
        const refs = [mesh.refCount, material.refCount],
            model = renderer.model,
            first = session.inspectNode(id),
            second = session.inspectNode(id);
        cases.push({
            kind,
            pixels: count(),
            first: first.visual.mesh!.visibility,
            second: second.visual.mesh!.visibility,
            nodeLayer: first.layer,
            sameModel: renderer.model === model,
            refsBefore: refs,
            refsAfter: [mesh.refCount, material.refCount],
            errors: app.diagnostics!.snapshot().filter((v) => v.severity === 'error'),
            toolErrors: session.getRuntimeErrors().errors,
        });
    };
    app.diagnostics!.clear();
    session.clearRuntimeErrors();
    observe('default');
    camera.visibility = 0;
    observe('wrongMask');
    camera.visibility = baseMask;
    node.layer = Layers.Enum.UI_2D;
    renderer.visibility = 0;
    observe('wrongLayer');
    renderer.visibility = Layers.Enum.DEFAULT;
    observe('modelFlagOverride');
    node.layer = baseLayer;
    renderer.visibility = baseVisibility;
    node.setPosition(1000, 0, 0);
    observe('outsideFrustum');
    node.setPosition(0, 0, 0);
    camera.enabled = false;
    observe('cameraDisabled');
    camera.enabled = true;
    renderer.enabled = false;
    observe('rendererDisabled');
    renderer.enabled = true;
    observe('restored');
    return { cases, diagnostics: app.diagnostics!.snapshot(), toolErrors: session.getRuntimeErrors().errors };
}
async function release() {
    session.close();
    const receipt = await app.releaseScene();
    mesh.destroy();
    material.destroy();
    director.tick(0);
    return { receipt, valid: [mesh.isValid, material.isValid] };
}
(window as any).__visibility = { ready: true, run, release };
