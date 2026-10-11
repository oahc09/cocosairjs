import { bootCapabilityLab } from '../../shared/capability-lab.js';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';
import type { AirGraphicsCommand } from 'cocosair';

const lab = await bootCapabilityLab('Graphics SVG paints');
const { rasterizeAirGraphics, createAirTextureSprite, airGraphicsCommandsToSvg, drawAirGraphics, Graphics } = lab.cc;
const bounds = { x: 0, y: 0, width: 128, height: 128 };
const rich: AirGraphicsCommand[] = [
    { op: 'rect', args: [0, 0, 128, 128] },
    { op: 'circle', args: [64, 64, 22] },
    {
        op: 'fill',
        rule: 'evenodd',
        paint: {
            kind: 'linear',
            from: [0, 0],
            to: [128, 0],
            stops: [
                { offset: 0, color: '#ff4400' },
                { offset: 1, color: '#0055ff' },
            ],
        },
    },
];
let paint = rasterizeAirGraphics(rich, { bounds, resolution: 2 });
let display = createAirTextureSprite(lab.ui, paint.texture, { name: 'Rich fill', size: [256, 256] });
const nativeNode = lab.node('Native Graphics'),
    graphics = nativeNode.addComponent(Graphics);
nativeNode.active = false;
const native: AirGraphicsCommand[] = [
    { op: 'roundRect', args: [-110, -90, 220, 180, 25] },
    { op: 'fill', paint: { color: '#32c9a5' } },
    { op: 'stroke', paint: { color: '#ffffff' }, width: 3 },
];
drawAirGraphics(graphics, native);
const svg = airGraphicsCommandsToSvg(rich, bounds),
    preview = document.getElementById('svg-preview') as HTMLImageElement;
preview.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
let disposed = false;
async function richView() {
    nativeNode.active = false;
    display.node.active = true;
    paint.update(rich);
    await lab.clock.step();
}
lab.button('solid', async () => {
    display.node.active = false;
    nativeNode.active = true;
    await lab.clock.step();
});
lab.button('gradient', richView);
lab.button('pattern', async () => {
    nativeNode.active = false;
    display.node.active = true;
    const tile = document.createElement('canvas');
    tile.width = tile.height = 16;
    const ctx = tile.getContext('2d')!;
    ctx.fillStyle = '#f3c45d';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = '#294b84';
    ctx.fillRect(8, 0, 8, 16);
    paint.update([
        { op: 'roundRect', args: [4, 4, 120, 120, 20] },
        { op: 'fill', paint: { kind: 'pattern', image: tile, width: 16, height: 8, transform: [1, 0, 0, 1, 3, 5] } },
    ]);
    await lab.clock.step();
});
lab.button('export', () => {
    const blob = new Blob([svg], { type: 'image/svg+xml' }),
        url = URL.createObjectURL(blob),
        a = document.createElement('a');
    a.href = url;
    a.download = 'air-graphics.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
});
await richView();
// §25 Lifecycle Contract：__lifecycle() 触发一轮 真实释放 → 泄漏核对 → 重新光栅化并挂回场景。
// nativeNode 的 Graphics 回放不属于被释放的自有纹理资源，保持在场以便验收对照。
// 生命周期轮次不使用 lab.clock.step()：__lifecycle 在 native pacer 下执行，
// 手动步进与真实时钟互斥；等待两帧即可让销毁提交与新画面落地。
const settleFrames = (): Promise<void> =>
    new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
installAssetLifecycle({
    label: 'graphics-svg-paints',
    hold: () =>
        disposed
            ? []
            : [
                  { name: 'raster-texture', ref: paint.texture },
                  { name: 'raster-sprite-node', ref: display.node },
              ],
    release: async () => {
        display.dispose();
        paint.dispose();
        await settleFrames();
    },
    reacquire: async () => {
        paint = rasterizeAirGraphics(rich, { bounds, resolution: 2 });
        display = createAirTextureSprite(lab.ui, paint.texture, { name: 'Rich fill', size: [256, 256] });
        nativeNode.active = false;
        display.node.active = true;
        paint.update(rich);
        await settleFrames();
        return [
            { name: 'raster-texture', ref: paint.texture },
            { name: 'raster-sprite-node', ref: display.node },
        ];
    },
});
lab.expose({
    async test() {
        if (disposed) throw new Error('example disposed');
        await richView();
        lab.check(lab.pixel(0.1)[0] > 180 && lab.pixel(0.9)[2] > 180, 'gradient visible in GPU pixels');
        lab.check(lab.pixel(0.5)[0] < 5, 'evenodd hole');
        await preview.decode();
        const roundtrip = document.createElement('canvas');
        roundtrip.width = roundtrip.height = 256;
        const ctx = roundtrip.getContext('2d')!;
        ctx.drawImage(preview, 0, 0, 256, 256);
        const a = ctx.getImageData(0, 0, 256, 256).data,
            b = paint.canvas.getContext('2d')!.getImageData(0, 0, 256, 256).data;
        let different = 0;
        for (let i = 0; i < a.length; i += 4)
            if ([0, 1, 2, 3].some((c) => Math.abs(a[i + c] - b[i + c]) > 8)) different++;
        lab.check(different < 65536 * 0.03, 'exported SVG roundtrip', { different });
        display.node.active = false;
        nativeNode.active = true;
        await lab.clock.step();
        lab.check(lab.pixel(0.5)[1] > 150, 'native Graphics replay');
        await richView();
        return { svgLength: svg.length };
    },
    async dispose() {
        if (!disposed) {
            disposed = true;
            display.dispose();
            nativeNode.destroy();
            paint.dispose();
            await lab.clock.step();
        }
        lab.check(!paint.texture.isValid, 'owned raster texture released');
        return { textureReleased: !paint.texture.isValid };
    },
});
