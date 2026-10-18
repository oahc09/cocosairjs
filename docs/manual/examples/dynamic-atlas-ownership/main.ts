import {
    createAirApp,
    createSessionScope,
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
    Director,
    director,
    dynamicAtlasManager,
} from 'cocosair';
import { ownSpriteFrame } from '../../../../examples/shared/owned-sprite-frame.js';
import { observeResource, assertResourceOwnership } from '../../../../tools/debug/resource-ownership.js';

const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('Atlas ownership');
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
app.run(scene);
dynamicAtlasManager.enabled = true;

function createCard(x: number, color: string) {
    const source = document.createElement('canvas');
    source.width = source.height = 48;
    const ctx = source.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 48, 48);
    const image = new ImageAsset(source);
    const texture = new Texture2D();
    texture.image = image;
    const frame = new SpriteFrame();
    frame.texture = texture;
    const node = new Node('Card');
    node.layer = Layers.Enum.UI_2D;
    ui.addChild(node);
    node.setPosition(x, 0, 0);
    node.addComponent(UITransform).setContentSize(100, 100);
    const sprite = node.addComponent(Sprite);
    sprite.spriteFrame = frame;
    dynamicAtlasManager.packToDynamicAtlas(sprite, frame);
    return { image, texture, frame, node };
}
// Two independent original textures share an atlas. The right card belongs to the gallery.
const gallery = createCard(120, '#55ddaa');
ownSpriteFrame(app.session!, gallery.frame, gallery.texture, gallery.image);
let scope = createSessionScope();
scope.activate();
let card: ReturnType<typeof createCard> | null = null;
let leaving: Promise<unknown> | null = null;
const settle = async () => {
    for (let i = 0; i < 3; i++) await new Promise<void>((resolve) => director.once(Director.EVENT_AFTER_DRAW, resolve));
};
function enter() {
    if (card || leaving) return;
    scope = createSessionScope();
    scope.activate();
    card = createCard(-120, '#77aaff');
    ownSpriteFrame(scope, card.frame, card.texture, card.image);
    const node = card.node;
    scope.own(() => {
        node.destroy();
    }, 'card-node');
    document.querySelector('#status')!.textContent = '已进入：左侧归当前作品，右侧归展厅';
}
async function leave() {
    if (leaving) return leaving;
    if (!card) return;
    const old = card;
    card = null;
    leaving = (async () => {
        const receipt = await scope.dispose();
        await scope.dispose(); // idempotent; no second destruction
        await settle();
        const atlas = gallery.frame.texture as Texture2D;
        const rows = [
            observeResource({
                label: 'original texture',
                resource: old.texture,
                ownership: 'owned',
                cleanupCompleted: receipt.status === 'released',
                gfxReleased: () => old.texture.getGFXTexture() === null,
            }),
            observeResource({
                label: 'frame',
                resource: old.frame,
                ownership: 'owned',
                cleanupCompleted: receipt.status === 'released',
            }),
            observeResource({
                label: 'gallery atlas',
                resource: atlas,
                ownership: 'shared',
                cleanupCompleted: false,
                gfxReleased: () => atlas.getGFXTexture() === null,
            }),
            observeResource({
                label: 'original image',
                resource: old.image,
                ownership: 'owned',
                cleanupCompleted: receipt.status === 'released',
            }),
        ];
        assertResourceOwnership(rows);
        document.querySelector('#status')!.textContent = JSON.stringify({ receipt, rows }, null, 2);
        return { receipt, rows };
    })();
    try {
        return await leaving;
    } finally {
        leaving = null;
    }
}
document.querySelector('#leave')!.addEventListener('click', () => {
    leave().catch(console.error);
});
document.querySelector('#enter')!.addEventListener('click', enter);
enter();
(window as any).__atlasOwnership = {
    enter,
    leave,
    snapshot: () => ({ entered: !!card, galleryPacked: !!gallery.frame.original }),
};
