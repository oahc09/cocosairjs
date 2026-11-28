/* Shared startup workload. Engine APIs are bound by the production build entry. */
const { moduleImportStart } = window.startup;
const query = new URLSearchParams(location.search);
const isCube = query.get('case') === 'S02';
const canvas = document.querySelector('canvas');
const width = canvas.width;
const height = canvas.height;
const target = [0, 0, 0];
const eye = [0, 3, 8];
const fov = 45;
const radians = Math.PI / 180;
const rotation = 15;
let renderAfterInput;
let context;
let frame = 0;

function submit() {
    frame += 1;
    if (frame === 1) {
        window.startup.firstDrawEvent = performance.now();
        window.startup.framebuffer = [canvas.width, canvas.height];
        const info = context.getExtension('WEBGL_debug_renderer_info');
        window.startup.renderer = info ? context.getParameter(info.UNMASKED_RENDERER_WEBGL) : null;
        window.startup.antialias = context.getContextAttributes().antialias;
    }
    if (window.startup.inputAt !== undefined && window.startup.inputDrawEvent === undefined) {
        window.startup.inputDrawEvent = performance.now();
        window.startup.inputFrame = frame;
    }
}

export async function start(engine, sdk) {
    const record = window.startup;
    if (!Number.isFinite(moduleImportStart)) throw new Error('Navigation bootstrap did not run');
    record.engineInitStart = performance.now();
    let attach;
    if (engine === 'air') {
        sdk.macro.ENABLE_WEBGL_ANTIALIAS = false;
        const app = await sdk.createAirApp({
            canvas,
            pixelRatioCap: 1,
            designResolution: { width, height, policy: 0 },
        });
        record.engineInitEnd = performance.now();
        record.sceneBuildStart = performance.now();
        const scene = new sdk.Scene('Startup');
        // Native PostSettingsInfo LINEAR: preserve the common linear-to-sRGB output without ACES.
        scene.globals.postSettings.toneMappingType = 1;
        const cameraNode = new sdk.Node('Camera');
        scene.addChild(cameraNode);
        cameraNode.setPosition(...eye);
        cameraNode.lookAt(new sdk.Vec3(...target));
        const camera = cameraNode.addComponent(sdk.Camera);
        camera.fov = fov;
        camera.near = 0.1;
        camera.far = 1000;
        camera.clearFlags = sdk.Camera.ClearFlag.SOLID_COLOR;
        camera.clearColor = new sdk.Color(56, 56, 56, 255);
        camera.visibility = sdk.Layers.Enum.DEFAULT;
        if (isCube) {
            const node = new sdk.Node('Cube');
            scene.addChild(node);
            const mesh = node.addComponent(sdk.MeshRenderer);
            mesh.mesh = sdk.utils.createMesh(sdk.primitives.box({ width: 1, height: 1, length: 1 }));
            const material = new sdk.Material();
            material.initialize({ effectName: 'builtin-unlit' });
            material.setProperty('mainColor', new sdk.Color(255, 128, 64, 255));
            mesh.setMaterial(material, 0);
            renderAfterInput = () => {
                node.setRotationFromEuler(0, rotation, 0);
                return node.eulerAngles.y;
            };
        }
        context = canvas.getContext('webgl2');
        attach = () => {
            sdk.director.on(sdk.Director.EVENT_AFTER_DRAW, submit);
            app.run(scene);
        };
    } else if (engine === 'three') {
        const renderer = new sdk.WebGLRenderer({ canvas, antialias: false, alpha: false });
        renderer.setPixelRatio(1);
        renderer.setSize(width, height, false);
        record.engineInitEnd = performance.now();
        record.sceneBuildStart = performance.now();
        const scene = new sdk.Scene();
        scene.background = new sdk.Color(0x383838);
        const camera = new sdk.PerspectiveCamera(fov, width / height, 0.1, 1000);
        camera.position.set(...eye);
        camera.lookAt(...target);
        if (isCube) {
            const mesh = new sdk.Mesh(new sdk.BoxGeometry(1, 1, 1), new sdk.MeshBasicMaterial({ color: 0xff8040 }));
            scene.add(mesh);
            renderAfterInput = () => {
                mesh.rotation.y = rotation * radians;
                return mesh.rotation.y / radians;
            };
        }
        context = renderer.getContext();
        attach = () => {
            renderer.setAnimationLoop(() => {
                renderer.render(scene, camera);
                submit();
            });
        };
    } else {
        throw new Error('Unknown engine');
    }
    if (!context) throw new Error('WebGL2 required');
    record.sceneBuildEnd = performance.now();
    if (isCube) {
        canvas.addEventListener(
            'click',
            () => {
                record.inputAt = performance.now();
                record.rotation = renderAfterInput();
            },
            { once: true },
        );
    }
    record.sceneActivateStart = performance.now();
    attach();
    record.sceneActivateEnd = performance.now();
}
