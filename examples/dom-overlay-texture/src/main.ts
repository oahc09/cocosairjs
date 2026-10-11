import { bootCapabilityLab } from '../../shared/capability-lab.js';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

const lab = await bootCapabilityLab('DOM overlay and texture anchors');
const { createAirTextureSprite, createAirDOMOverlay, UITransform } = lab.cc;
let texture = lab.texture(2, 2, [240, 210, 90, 255, 80, 210, 190, 255, 190, 90, 210, 255, 80, 130, 230, 255]);
let display = createAirTextureSprite(lab.ui, texture, { name: 'Anchor preview', size: [180, 180] });
const target = lab.node('DOM target'),
    element = document.getElementById('live-form') as HTMLDivElement;
target.setPosition(0, 0, 0);
let overlay = createAirDOMOverlay({ canvas: lab.canvas, className: 'air-dom-overlay' });
let binding = overlay.attach(element, target, lab.camera, { width: 100, height: 65 });
let hits = 0,
    disposed = false,
    moved = false;
document.getElementById('live-button')!.addEventListener('click', () => {
    hits++;
    document.getElementById('live-button')!.textContent = `Clicked ${hits}`;
});
async function update() {
    await lab.clock.step();
    overlay.update();
}
lab.button('move', async () => {
    moved = !moved;
    target.setPosition(moved ? 50 : 0, moved ? 25 : 0, 0);
    target.setRotationFromEuler(0, 0, moved ? 12 : 0);
    target.setScale(moved ? 1.1 : 1, moved ? 1.1 : 1, 1);
    await update();
});
lab.button('anchor', async () => {
    const transform = display.node.getComponent(UITransform)!;
    const alternate = transform.anchorX === 0.5;
    transform.setAnchorPoint(alternate ? 0 : 0.5, alternate ? 1 : 0.5);
    await update();
});
lab.button('resize', async () => {
    texture.reset({ width: 4, height: 4, mipmapLevel: 1 });
    texture.uploadData(new Uint8Array(Array(16).fill([50, 190, 160, 255]).flat()));
    display.refresh();
    await update();
    lab.check(Math.abs(lab.pixel(0.25)[1] - 190) < 6, 'resized texture remains visible in GPU pixels', lab.pixel(0.25));
});
lab.button('restore', async () => {
    binding.dispose();
    lab.check(document.getElementById('original')!.firstElementChild === element, 'DOM restored to original parent');
    binding = overlay.attach(element, target, lab.camera, { width: 100, height: 65 });
    await update();
});
await update();
// §25 Lifecycle Contract：__lifecycle() 触发一轮 真实释放 → 泄漏核对 → 重建纹理/展示面并重挂 DOM 锚点。
// 生命周期轮次不使用 lab.clock.step()：__lifecycle 在 native pacer 下执行，
// 手动步进与真实时钟互斥；等待两帧即可让销毁提交与新画面落地。
const settleFrames = (): Promise<void> =>
    new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
installAssetLifecycle({
    label: 'dom-overlay-texture',
    hold: () =>
        disposed
            ? []
            : [
                  { name: 'anchor-texture', ref: texture },
                  { name: 'anchor-sprite-node', ref: display.node },
              ],
    release: async () => {
        binding.dispose();
        overlay.dispose();
        display.dispose();
        texture.destroy();
        await settleFrames();
    },
    reacquire: async () => {
        texture = lab.texture(2, 2, [240, 210, 90, 255, 80, 210, 190, 255, 190, 90, 210, 255, 80, 130, 230, 255]);
        display = createAirTextureSprite(lab.ui, texture, { name: 'Anchor preview', size: [180, 180] });
        overlay = createAirDOMOverlay({ canvas: lab.canvas, className: 'air-dom-overlay' });
        binding = overlay.attach(element, target, lab.camera, { width: 100, height: 65 });
        await settleFrames();
        overlay.update();
        return [
            { name: 'anchor-texture', ref: texture },
            { name: 'anchor-sprite-node', ref: display.node },
        ];
    },
});
lab.expose({
    async test() {
        if (disposed) throw new Error('example disposed');
        target.setPosition(0, 0, 0);
        target.setScale(1, 1, 1);
        target.setRotationFromEuler(0, 0, 0);
        await update();
        const before = element.getBoundingClientRect();
        target.setPosition(40, 20, 0);
        target.setRotationFromEuler(0, 0, 10);
        await update();
        const after = element.getBoundingClientRect();
        lab.check(after.x > before.x && after.y < before.y, 'overlay follows native translation and rotation', {
            before: before.toJSON(),
            after: after.toJSON(),
        });
        const ui = display.node.getComponent(UITransform)!;
        ui.setAnchorPoint(0, 1);
        await update();
        lab.check(lab.pixel(0.25, 0.75)[0] < 5 && lab.pixel(0.75, 0.25)[1] > 50, 'anchor changes occupied GPU region');
        ui.setAnchorPoint(0.5, 0.5);
        target.setPosition(0, 0, 0);
        target.setRotationFromEuler(0, 0, 0);
        await update();
        lab.check(display.frame.rect.width === texture.width, 'frame dimensions follow native texture');
        return { hits, value: (document.getElementById('live-input') as HTMLInputElement).value };
    },
    interaction() {
        return { hits, value: (document.getElementById('live-input') as HTMLInputElement).value };
    },
    async redraw() {
        await update();
        return { rect: element.getBoundingClientRect().toJSON(), pixel: lab.pixel(0.25) };
    },
    async dispose() {
        if (!disposed) {
            disposed = true;
            binding.dispose();
            overlay.dispose();
            display.dispose();
            texture.destroy();
            await lab.clock.step();
        }
        return {
            restored: document.getElementById('original')!.firstElementChild === element,
            overlayRemoved: !overlay.root.isConnected,
            textureReleased: !texture.isValid,
        };
    },
});
