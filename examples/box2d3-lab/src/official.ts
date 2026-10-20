const moduleUrl = new URL('/build/box2d3-samples/air-box2d-samples.mjs', location.href).href;
const factory = (await import(moduleUrl)).default;
const response = await fetch('/build/box2d3-samples/air-box2d-samples.wasm');
if (!response.ok)
    throw Error(`Official sample assets: HTTP ${response.status}. Run node tools/build/box2d3.cjs --build.`);
const samples = await factory({ wasmBinary: await response.arrayBuffer() });
const canvas = document.getElementById('view') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const select = document.getElementById('sample') as HTMLSelectElement;
const status = document.getElementById('status')!;
const list = samples.list() as { index: number; category: string; name: string }[];
for (const row of list) select.add(new Option(`${row.category} / ${row.name}`, String(row.index)));
let paused = false,
    frame = 0;
export function draw(snapshot: any) {
    ctx.fillStyle = '#111b29';
    ctx.fillRect(0, 0, 1280, 720);
    const camera = snapshot.camera,
        scale = 720 / (2 * camera.zoom);
    const x = (n: number) => 640 + (n - camera.x) * scale,
        y = (n: number) => 360 - (n - camera.y) * scale;
    const g = snapshot.geometry as number[];
    for (let i = 0; i < g.length;) {
        const type = g[i++],
            color = g[i++],
            length = g[i++],
            p = g.slice(i, i + length);
        i += length;
        ctx.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (type === 1) {
            ctx.arc(x(p[0]), y(p[1]), Math.max(1, p[2] / 2), 0, Math.PI * 2);
            ctx.fill();
        } else if (type === 2) {
            ctx.moveTo(x(p[0]), y(p[1]));
            ctx.lineTo(x(p[2]), y(p[3]));
            ctx.stroke();
        } else if (type === 3) {
            ctx.arc(x(p[0]), y(p[1]), Math.abs(p[2] * scale), 0, Math.PI * 2);
            ctx.stroke();
        } else {
            for (let k = 0; k < p.length; k += 2) {
                if (k === 0) ctx.moveTo(x(p[k]), y(p[k + 1]));
                else ctx.lineTo(x(p[k]), y(p[k + 1]));
            }
            ctx.closePath();
            ctx.stroke();
        }
    }
    ctx.font = '14px monospace';
    ctx.fillStyle = '#dfebfa';
    snapshot.text.slice(0, 15).forEach((s: string, i: number) => ctx.fillText(s, 18, 24 + i * 19));
    status.textContent = `${list.length} official scenarios · step ${snapshot.step} · ${snapshot.bodies ?? 0} bodies · ${snapshot.shapes ?? 0} shapes · ${snapshot.primitives} draw calls`;
}
function open(index: number) {
    samples.open(index);
    draw(samples.tick(1, true));
}
select.addEventListener('change', () => open(+select.value));
document.getElementById('restart')!.addEventListener('click', () => open(+select.value));
document.getElementById('pause')!.addEventListener('click', () => {
    paused = !paused;
    document.getElementById('pause')!.textContent = paused ? '继续' : '暂停';
});
document.getElementById('step')!.addEventListener('click', () => draw(samples.tick(1, true)));
window.addEventListener('keydown', (e) => samples.key(e.keyCode, true));
window.addEventListener('keyup', (e) => samples.key(e.keyCode, false));
canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointer(e, 0);
});
canvas.addEventListener('pointermove', (e) => {
    if (e.buttons) pointer(e, 1);
});
canvas.addEventListener('pointerup', (e) => pointer(e, 2));
function pointer(e: PointerEvent, action: number) {
    const r = canvas.getBoundingClientRect(),
        c = samples.snapshot().camera;
    const sx = (e.clientX - r.left) / r.width,
        sy = (e.clientY - r.top) / r.height;
    samples.pointer(c.x + ((sx * 2 - 1) * c.zoom * 1280) / 720, c.y + (1 - sy * 2) * c.zoom, action);
}
function loop() {
    if (!paused) draw(samples.tick(1, true));
    frame = requestAnimationFrame(loop);
}
open(0);
frame = requestAnimationFrame(loop);
(window as any).box2d3Official = {
    samples,
    list,
    draw,
    stop: () => {
        paused = true;
        cancelAnimationFrame(frame);
    },
    open,
};
