import * as runtime from 'cocosair.js';
const { createAirApp, Scene, Node, Camera, MeshRenderer, DirectionalLight, Material, Color, primitives, utils, Vec3 } =
    runtime;
const app = await createAirApp({ canvas: '#GameCanvas', pixelRatioCap: 1 });
const scene = new Scene('TarballConsumer');
const cameraNode = new Node('Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.6, 5));
cameraNode.lookAt(new Vec3(0, 0.5, 0));
const camera = cameraNode.addComponent(Camera);
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(20, 40, 100, 255);
const light = new Node('Light');
scene.addChild(light);
light.addComponent(DirectionalLight);
const cube = new Node('Cube');
scene.addChild(cube);
const renderer = cube.addComponent(MeshRenderer);
const mesh = utils.createMesh(primitives.box({}));
renderer.mesh = mesh;
const material = new Material();
material.initialize({ effectName: 'builtin-unlit' });
material.setProperty('mainColor', new Color(230, 30, 20, 255));
renderer.setSharedMaterial(material, 0);
const materialInstance = renderer.getMaterialInstance(0);
if (!materialInstance || materialInstance.parent !== material) throw new Error('native material instance path failed');
const clone = runtime.instantiate(cube);
clone.setPosition(2, 0, 0);
scene.addChild(clone);
if (clone === cube || clone.getComponent(MeshRenderer) === renderer) throw new Error('native instance state shared');
const empty = new Node('Empty');
scene.addChild(empty);
if (empty.addComponent(MeshRenderer).getMaterialInstance(0) !== null)
    throw new Error('missing material slot must be null');
app.session.own(() => {
    mesh.destroy();
    material.destroy();
}, 'upstream-sdk-fixture-assets');
app.run(scene);
const clock = runtime.createStepClock({ stepTimeoutMs: 10000 });
clock.begin();
const firstFrame = await clock.step(0);
const gl = app.canvas.getContext('webgl2');
if (!gl) throw new Error('default consumer did not create WebGL2');
const bytes = new Uint8Array(4 * 100);
gl.readPixels(200, 150, 10, 10, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
let nonZeroAlphaPixels = 0;
for (let index = 3; index < bytes.length; index += 4) if (bytes[index] !== 0) nonZeroAlphaPixels++;
window.__consumer = {
    apiRoundtrip: [
        typeof createAirApp,
        Scene.name,
        Node.name,
        Camera.name,
        MeshRenderer.name,
        Material.name,
        Color.name,
    ].join(','),
    probe() {
        return {
            apiRoundtrip: this.apiRoundtrip,
            apiTypes: Object.fromEntries(
                ['createAirApp', 'Scene', 'Node', 'Camera', 'MeshRenderer', 'Material', 'Color'].map((name) => [
                    name,
                    typeof runtime[name],
                ]),
            ),
            nonZeroAlphaPixels,
            canvasSize: [app.canvas.width, app.canvas.height].join('x'),
            firstFrame,
            nativeInstances: {
                separateNode: clone !== cube,
                separateRenderer: clone.getComponent(MeshRenderer) !== renderer,
                parentMatches: materialInstance.parent === material,
                nativeScene: scene instanceof Scene,
                nativeNode: cube instanceof Node,
                nativeRenderer: renderer instanceof MeshRenderer,
                nativeMaterial: materialInstance instanceof Material,
            },
            backend: 'webgl2',
            buildDate: runtime.AIR_BUILD_DATE,
            buildNumber: runtime.AIR_BUILD_NUMBER,
        };
    },
    async close() {
        // Restore the native pacer before the lifecycle operation pauses it as part of shutdown.
        clock.end();
        const released = await app.releaseScene();
        const closed = await app.close();
        let terminalCode;
        try {
            await createAirApp({ canvas: app.canvas, pixelRatioCap: 1 });
        } catch (error) {
            terminalCode = error.code;
        }
        return {
            released,
            closed,
            scene: app.getScene(),
            sceneValid: scene.isValid,
            meshValid: mesh.isValid,
            materialValid: material.isValid,
            terminalCode,
        };
    },
};
