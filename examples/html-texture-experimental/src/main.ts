import { bootCapabilityLab } from '../../shared/capability-lab.js';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';
import { createAirHTMLSource, getAirHTMLSourceSupport } from 'cocosair/html-source';

const lab = await bootCapabilityLab('Experimental HTML texture');
const { Texture2D, createAirTextureSprite } = lab.cc;
const support = getAirHTMLSourceSupport(lab.canvas);
let placeholder = lab.texture(2, 2, [35, 70, 95, 255, 65, 120, 130, 255, 65, 120, 130, 255, 35, 70, 95, 255]);
let display = createAirTextureSprite(lab.ui, placeholder, { name: 'HTML texture surface', size: [256, 256] });
let texture = new Texture2D();
let source: ReturnType<typeof createAirHTMLSource> | null = null,
    element: HTMLDivElement | null = null,
    hits = 0,
    uploads = 0,
    disposed = false;
async function wait() {
    const start = performance.now();
    while (source?.status !== 'ready') {
        if (source?.status === 'failed') throw source.error;
        if (performance.now() - start > 5000) throw new Error('HTML paint timeout');
        await new Promise((r) => requestAnimationFrame(r));
    }
    display.frame.texture = texture;
    await lab.clock.step();
}
async function attach(snapshot = false) {
    if (!support.supported) return;
    source?.dispose();
    element?.remove();
    element = document.createElement('div');
    element.innerHTML =
        '<button id="html-button" style="font-size:6px;width:40px;height:14px;padding:0">Click HTML</button><input id="html-input" value="Editable" style="font-size:6px;width:54px;height:14px;margin-top:4px">';
    Object.assign(element.style, {
        width: '64px',
        height: '64px',
        padding: '3px',
        boxSizing: 'border-box',
        background: 'rgb(0,0,255)',
    });
    element.querySelector('button')!.onclick = () => {
        hits++;
    };
    lab.canvas.appendChild(element);
    source = createAirHTMLSource({
        canvas: lab.canvas,
        element,
        texture,
        resolution: 1,
        snapshot,
        onUpdate: () => {
            uploads++;
        },
    });
    await wait();
    const rect = lab.canvas.getBoundingClientRect();
    source.updateGeometry({ canvasTransform: { a: rect.width / 64, d: rect.height / 64 } });
}
lab.button('live', () => attach(false));
lab.button('snapshot', () => attach(true));
lab.button('color', async () => {
    if (!element || !source) return;
    element.style.background = element.style.background === 'rgb(0, 0, 255)' ? 'rgb(0,255,0)' : 'rgb(0,0,255)';
    source.update();
    await wait();
});
if (support.supported) {
    await attach();
    document.getElementById('availability')!.textContent = 'SUPPORTED · 可查看实时 HTML 重绘与不可变快照。';
} else {
    document.getElementById('availability')!.textContent =
        'UNSUPPORTED · 此浏览器未提供实验 HTML-in-Canvas API。可在启用实验特性的 Chrome 中查看。';
    for (const id of ['live', 'snapshot', 'color']) (document.getElementById(id) as HTMLButtonElement).disabled = true;
    await lab.clock.step();
}
// §25 Lifecycle Contract：__lifecycle() 触发一轮 真实释放 → 泄漏核对 → 重建占位纹理/展示面。
// 重建到首帧占位状态：实验 HTML 源仅在 SUPPORTED 环境挂接，且其挂接不依赖被释放的自有纹理。
// 生命周期轮次不使用 lab.clock.step()：__lifecycle 在 native pacer 下执行，
// 手动步进与真实时钟互斥；等待两帧即可让销毁提交与新画面落地。
const settleFrames = (): Promise<void> =>
    new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
installAssetLifecycle({
    label: 'html-texture-experimental',
    hold: () =>
        disposed
            ? []
            : [
                  { name: 'placeholder-texture', ref: placeholder },
                  { name: 'html-texture', ref: texture },
                  { name: 'html-sprite-node', ref: display.node },
              ],
    release: async () => {
        source?.dispose();
        element?.remove();
        display.dispose();
        texture.destroy();
        placeholder.destroy();
        await settleFrames();
    },
    reacquire: async () => {
        placeholder = lab.texture(2, 2, [35, 70, 95, 255, 65, 120, 130, 255, 65, 120, 130, 255, 35, 70, 95, 255]);
        display = createAirTextureSprite(lab.ui, placeholder, { name: 'HTML texture surface', size: [256, 256] });
        texture = new Texture2D();
        await settleFrames();
        return [
            { name: 'placeholder-texture', ref: placeholder },
            { name: 'html-texture', ref: texture },
            { name: 'html-sprite-node', ref: display.node },
        ];
    },
});
lab.expose({
    support,
    async redraw() {
        if (source) {
            source.update();
            await wait();
            const rect = lab.canvas.getBoundingClientRect();
            source.updateGeometry({ canvasTransform: { a: rect.width / 64, d: rect.height / 64 } });
        } else await lab.clock.step();
    },
    async test() {
        if (disposed) throw new Error('example disposed');
        if (!support.supported) {
            let code = '';
            try {
                createAirHTMLSource({ canvas: lab.canvas, element: document.body, texture });
            } catch (error) {
                code = (error as { code: string }).code;
            }
            lab.check(code === 'AIR_E_HTML_SOURCE_UNSUPPORTED', 'unsupported API rejected before mutation', code);
            return { status: 'UNSUPPORTED', reason: support.reason };
        }
        await attach();
        lab.check(lab.pixel(0.9, 0.1)[2] > 240, 'live HTML uploaded to GPU');
        element!.style.background = 'rgb(0,255,0)';
        source!.update();
        await wait();
        lab.check(lab.pixel(0.9, 0.1)[1] > 240, 'live HTML repaint visible');
        await attach(true);
        const before = lab.pixel(0.9, 0.1);
        element!.style.background = 'rgb(255,0,0)';
        source!.update();
        await wait();
        lab.check(
            lab.pixel(0.9, 0.1).every((v, i) => v === before[i]),
            'snapshot immutable after DOM changes',
        );
        await attach();
        return { status: 'PASS', uploads };
    },
    async interaction() {
        source?.update();
        if (source) await wait();
        return { hits, value: element?.querySelector('input')?.value, uploads };
    },
    async dispose() {
        if (!disposed) {
            disposed = true;
            source?.dispose();
            element?.remove();
            display.dispose();
            texture.destroy();
            placeholder.destroy();
            await lab.clock.step();
        }
        return {
            attributesRestored: !lab.canvas.hasAttribute('content') && !lab.canvas.hasAttribute('layoutsubtree'),
            textureReleased: !texture.isValid,
        };
    },
});
