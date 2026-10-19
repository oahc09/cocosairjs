import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Canvas,
    UITransform,
    Sprite,
    SpriteFrame,
    Texture2D,
    ImageAsset,
    Color,
    Layers,
} from 'cocosair';
import { createSpriteContentReplacement } from '../../../../examples/shared/replace-owned-sprite-frame.js';
const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('Atomic image replacement');
const cameraNode = new Node('Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(0, 0, 1000);
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.ORTHO;
camera.orthoHeight = 240;
camera.near = 0.1;
camera.far = 2000;
camera.visibility = Layers.Enum.UI_2D;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(21, 25, 35, 255);
const ui = new Node('UI');
ui.layer = Layers.Enum.UI_2D;
scene.addChild(ui);
ui.addComponent(UITransform).setContentSize(640, 480);
ui.addComponent(Canvas).cameraComponent = camera;
const card = new Node('Artwork');
card.layer = Layers.Enum.UI_2D;
ui.addChild(card);
card.addComponent(UITransform).setContentSize(320, 320);
const sprite = card.addComponent(Sprite);
app.run(scene);
const replacement = createSpriteContentReplacement(app.session!, sprite);
const status = document.querySelector<HTMLElement>('#status')!,
    listeners = new AbortController();
app.session!.own(() => listeners.abort(), 'texture-example-listeners');
function fromCanvas(source: HTMLCanvasElement) {
    const image = new ImageAsset(source),
        texture = new Texture2D(),
        frame = new SpriteFrame();
    try {
        texture.image = image;
        frame.texture = texture;
        return { image, texture, frame };
    } catch (error) {
        frame.destroy();
        texture.destroy();
        image.destroy();
        throw error;
    }
}
function showError(error: unknown) {
    status.textContent = `Previous image retained: ${String(error)}`;
}
async function paper() {
    const result = await replacement.replace('paper', async () => {
        const source = document.createElement('canvas');
        source.width = source.height = 256;
        const context = source.getContext('2d')!;
        context.fillStyle = document.querySelector<HTMLInputElement>('#paper')!.value;
        context.fillRect(0, 0, 256, 256);
        context.fillStyle = '#142438';
        context.font = 'bold 36px sans-serif';
        context.fillText('PAPER', 60, 138);
        return fromCanvas(source);
    });
    status.textContent = `${result}; owned callbacks: ${app.session!.ownedCount}`;
}
document.querySelector('#paper')!.addEventListener(
    'input',
    () => {
        void paper().catch(showError);
    },
    { signal: listeners.signal },
);
document.querySelector('#import')!.addEventListener(
    'change',
    () => {
        const file = document.querySelector<HTMLInputElement>('#import')!.files?.[0];
        if (!file) return;
        void replacement
            .replace('import', async (signal) => {
                const bitmap = await createImageBitmap(file);
                try {
                    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
                    const source = document.createElement('canvas');
                    source.width = source.height = 256;
                    source.getContext('2d')!.drawImage(bitmap, 0, 0, 256, 256);
                    return fromCanvas(source);
                } finally {
                    bitmap.close();
                }
            })
            .then((result) => {
                status.textContent = `${result}; owned callbacks: ${app.session!.ownedCount}`;
            })
            .catch(showError);
    },
    { signal: listeners.signal },
);
document.querySelector('#close')!.addEventListener(
    'click',
    () => {
        void app.close!().then((receipt) => {
            status.textContent = JSON.stringify(receipt);
        });
    },
    { signal: listeners.signal },
);
window.addEventListener(
    'pagehide',
    () => {
        void app.close!();
    },
    { signal: listeners.signal },
);
await paper();

export const verification = { app, scene, sprite, replacement };
