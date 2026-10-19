import {
    createAirApp,
    createSessionScope,
    Scene,
    Node,
    Camera,
    Color,
    Vec3,
    MeshRenderer,
    Material,
    utils,
} from 'cocosair';
import { createAsyncAppLifecycle } from '../../../../examples/shared/async-app-lifecycle.js';
import {
    createTwoSidedPage,
    uploadTwoSidedPage,
} from '../../../../examples/interactive-geometry/src/two-sided-page.js';

const canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas')!;
const angle = document.querySelector<HTMLInputElement>('#angle')!;
const audioButton = document.querySelector<HTMLButtonElement>('#audio')!;
const status = document.querySelector<HTMLElement>('#status')!;
const listeners = new AbortController();
let audio: AudioContext | undefined;
let currentApp: Awaited<ReturnType<typeof createAirApp>> | undefined;
let mountedResource: unknown;
const recipe = createAsyncAppLifecycle({
    session: createSessionScope(),
    createApp: async () => {
        const app = await createAirApp({ canvas, pixelRatioCap: 2 });
        currentApp = app;
        if (!app.close) throw new Error('This recipe requires AirApp.close.');
        return app as typeof app & { close: NonNullable<typeof app.close> };
    },
    load: async (_app, signal) => {
        await new Promise<void>((resolve, reject) => {
            const cancel = () => {
                clearTimeout(timer);
                reject(new DOMException('Cancelled', 'AbortError'));
            };
            const timer = setTimeout(() => {
                signal.removeEventListener('abort', cancel);
                resolve();
            }, 1000);
            signal.addEventListener('abort', cancel, { once: true });
            if (signal.aborted) cancel();
        });
        const allocations: { destroy(): unknown }[] = [];
        try {
            const scene = new Scene('Two-sided page');
            allocations.push(scene);
            const cameraNode = new Node('Camera');
            scene.addChild(cameraNode);
            cameraNode.setPosition(0, 0.6, 6);
            cameraNode.lookAt(new Vec3());
            const camera = cameraNode.addComponent(Camera);
            camera.projection = Camera.ProjectionType.ORTHO;
            camera.orthoHeight = 1.7;
            camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
            camera.clearColor = new Color(21, 32, 43, 255);
            const geometry = createTwoSidedPage(0);
            const makeSide = (side: 'front' | 'back', color: Color) => {
                const mesh = utils.MeshUtils.createDynamicMesh(0, geometry[side], undefined, {
                    maxSubMeshes: 1,
                    maxSubMeshVertices: 50,
                    maxSubMeshIndices: 144,
                });
                allocations.push(mesh);
                const material = new Material();
                allocations.push(material);
                material.initialize({ effectName: 'builtin-unlit' });
                material.setProperty('mainColor', color);
                const node = new Node(side);
                scene.addChild(node);
                const renderer = node.addComponent(MeshRenderer);
                renderer.mesh = mesh;
                renderer.setSharedMaterial(material, 0);
                return { mesh, renderer, material };
            };
            return {
                scene,
                front: makeSide('front', new Color(255, 154, 60)),
                back: makeSide('back', new Color(70, 160, 255)),
            };
        } catch (error) {
            for (const allocation of allocations.reverse()) allocation.destroy();
            throw error;
        }
    },
    mount: (app, resource) => {
        mountedResource = resource;
        app.run(resource.scene);
        angle.disabled = audioButton.disabled = false;
        status.textContent = 'Turn 0–180° and back. Orange front and blue back keep their identities.';
        angle.addEventListener(
            'input',
            () => {
                uploadTwoSidedPage((Number(angle.value) * Math.PI) / 180, resource.front, resource.back);
            },
            { signal: listeners.signal },
        );
    },
    releaseResource: ({ scene, front, back }) => {
        // The scene may never have been mounted when a load completed after close.
        if (scene.isValid) scene.destroy();
        for (const side of [front, back]) {
            side.mesh.destroy();
            side.material.destroy();
        }
    },
    releaseAudio: async () => {
        if (audio && audio.state !== 'closed') await audio.close();
    },
    disableInput: () => {
        angle.disabled = audioButton.disabled = true;
    },
    removeListeners: () => listeners.abort(),
});
audioButton.addEventListener(
    'click',
    () => {
        void (async () => {
            audio ??= new AudioContext();
            await audio.resume();
            if (recipe.signal.aborted || audio.state === 'closed') return;
            const oscillator = audio.createOscillator(),
                gain = audio.createGain();
            gain.gain.value = 0.04;
            oscillator.connect(gain).connect(audio.destination);
            oscillator.onended = () => {
                oscillator.disconnect();
                gain.disconnect();
            };
            oscillator.start();
            oscillator.stop(audio.currentTime + 0.15);
        })().catch((error) => {
            status.textContent = String(error);
        });
    },
    { signal: listeners.signal },
);
document.querySelector('#close')!.addEventListener(
    'click',
    () => {
        void recipe.close().then((receipt) => {
            status.textContent = JSON.stringify(receipt);
        });
    },
    { signal: listeners.signal },
);
window.addEventListener(
    'pagehide',
    () => {
        void recipe.close();
    },
    { signal: listeners.signal },
);
void recipe.ready.catch((error) => {
    status.textContent = recipe.signal.aborted ? 'Closed before mount. Reload to enter again.' : String(error);
});

/** Read-only handles for a dedicated external collector; actions still use real DOM controls. */
export const verification = {
    recipe,
    get app() {
        return currentApp;
    },
    get resource() {
        return mountedResource;
    },
    get audio() {
        return audio;
    },
};
