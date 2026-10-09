// Native WebGL2 control: same host/template. Explicit browser canvas sizing is confined to this no-SDK arm.
const host = document.querySelector<HTMLElement>('#host')!,
    parent = document.querySelector<HTMLElement>('#parent')!,
    canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas')!;
const gl = canvas.getContext('webgl2')!;
if (!gl) throw Error('WEBGL2_REQUIRED');
const listeners = new AbortController();
let frame = 0,
    disposed = false,
    raf = 0,
    read = [0, 0, 0, 0];
function render(): void {
    if (disposed) return;
    const r = host.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
        const w = Math.round(r.width * devicePixelRatio),
            h = Math.round(r.height * devicePixelRatio);
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        gl.viewport(0, 0, w, h);
        gl.clearColor(1, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const a = new Uint8Array(4);
        gl.readPixels(Math.floor(w / 2), Math.floor(h / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, a);
        read = Array.from(a);
    }
    frame++;
    raf = requestAnimationFrame(render);
}
for (const name of ['narrow', 'wide'])
    document
        .querySelector('#' + name)!
        .addEventListener('click', () => (parent.className = name), { signal: listeners.signal });
for (const id of ['run', 'show'])
    document
        .querySelector('#' + id)!
        .addEventListener('click', () => host.classList.remove('hidden'), { signal: listeners.signal });
document
    .querySelector('#hide')!
    .addEventListener('click', () => host.classList.add('hidden'), { signal: listeners.signal });
(window as unknown as Record<string, unknown>).__containerControl = {
    snapshot: () => {
        const r = host.getBoundingClientRect();
        return {
            containsSDK: false,
            css: { width: r.width, height: r.height },
            buffer: { width: canvas.width, height: canvas.height },
            dpr: devicePixelRatio,
            frame,
            readPixels: [...read],
            glError: gl.getError(),
            contextLost: gl.isContextLost(),
            canvasRect: { x: r.x, y: r.y, width: r.width, height: r.height },
        };
    },
    release: () => {
        disposed = true;
        listeners.abort();
        cancelAnimationFrame(raf);
        return { disposed, listenersDetached: listeners.signal.aborted };
    },
};
raf = requestAnimationFrame(render);
export {};
