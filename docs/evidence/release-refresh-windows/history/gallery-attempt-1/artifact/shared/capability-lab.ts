import { createAirApp } from 'cocosair';

/** Shared page shell only. Each example owns its native scene and assertions. */
export async function bootCapabilityLab(name: string) {
    const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
    const app = await createAirApp({
        canvas,
        screenMode: 'container',
        container: '#stage',
        pixelRatioCap: 1,
        designResolution: { width: 256, height: 256, policy: 0 },
    });
    const cc = await import('cocosair');
    const scene = new cc.Scene(name),
        ui = cc.createUICanvas(scene, 'Lab UI', { designWidth: 256, designHeight: 256 });
    const camera = ui.getComponentInChildren(cc.Camera)!;
    camera.clearColor = new cc.Color(0, 0, 0, 255);
    app.run(scene);
    const clock = cc.createStepClock();
    clock.begin();
    const gl = canvas.getContext('webgl2')!;
    const rows: { name: string; actual: unknown }[] = [];
    const status = document.getElementById('status')!,
        details = document.getElementById('results')!;
    function check(condition: unknown, name: string, actual: unknown = condition): void {
        rows.push({ name, actual });
        if (!condition) throw new Error(`${name}: ${JSON.stringify(actual)}`);
    }
    function pixel(x: number, y = 0.5): number[] {
        const value = new Uint8Array(4);
        gl.readPixels(
            Math.floor(x * gl.drawingBufferWidth),
            Math.floor(y * gl.drawingBufferHeight),
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            value,
        );
        return [...value];
    }
    function texture(width: number, height: number, bytes: number[]): InstanceType<typeof cc.Texture2D> {
        const value = new cc.Texture2D();
        value.reset({ width, height, mipmapLevel: 1 });
        value.setFilters(cc.Texture2D.Filter.NEAREST, cc.Texture2D.Filter.NEAREST);
        value.uploadData(new Uint8Array(bytes));
        return value;
    }
    function node(name: string): InstanceType<typeof cc.Node> {
        const value = new cc.Node(name);
        value.layer = ui.layer;
        value.addComponent(cc.UITransform).setContentSize(256, 256);
        ui.addChild(value);
        return value;
    }
    let queue = Promise.resolve();
    let activeProbe: { redraw?: () => Promise<unknown> } | null = null;
    let resizeTimer: ReturnType<typeof setTimeout>;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (!activeProbe) return;
            queue = queue.then(async () => {
                if (activeProbe?.redraw) await activeProbe.redraw();
                else await clock.step();
            });
        }, 350);
    });
    function button(id: string, action: () => unknown | Promise<unknown>): void {
        document.getElementById(id)!.addEventListener('click', () => {
            queue = queue
                .then(async () => {
                    clock.begin();
                    try {
                        await action();
                    } finally {
                        if (id !== 'dispose') clock.end();
                    }
                    if (id !== 'verify' && id !== 'dispose') status.textContent = 'READY · updated';
                })
                .catch((error) => {
                    status.textContent = 'FAIL';
                    details.textContent = String(error.stack || error);
                    throw error;
                });
        });
    }
    function expose(probe: { test(): Promise<unknown>; dispose(): Promise<unknown>; [key: string]: unknown }): void {
        const redraw = async (): Promise<unknown> => {
            clock.begin();
            try {
                return typeof probe.redraw === 'function'
                    ? await (probe.redraw as () => Promise<unknown>)()
                    : await clock.step();
            } finally {
                if (activeProbe) clock.end();
            }
        };
        activeProbe = { redraw };
        const run = async (): Promise<unknown> => {
            rows.length = 0;
            clock.begin();
            try {
                const result = await probe.test();
                check(gl.getError() === gl.NO_ERROR, 'WebGL error free');
                status.textContent = `PASS · ${rows.length} assertions`;
                details.textContent = rows.map((r) => `✓ ${r.name}`).join('\n');
                return { rows: rows.slice(), result };
            } catch (error) {
                status.textContent = 'FAIL';
                details.textContent = String(error);
                throw error;
            } finally {
                if (activeProbe) clock.end();
            }
        };
        Object.assign(window, {
            __airApp: app,
            __exampleProbe: {
                ...probe,
                redraw,
                interaction: async () => {
                    clock.begin();
                    try {
                        return typeof probe.interaction === 'function'
                            ? await (probe.interaction as () => unknown)()
                            : null;
                    } finally {
                        if (activeProbe) clock.end();
                    }
                },
                test: run,
                ready: true,
                idle: () => queue,
                rows,
            },
        });
        button('verify', run);
        button('dispose', async () => {
            const result = await probe.dispose();
            activeProbe = null;
            clearTimeout(resizeTimer);
            status.textContent = 'RELEASED';
            details.textContent = JSON.stringify(result, null, 2);
            document.querySelectorAll('button').forEach((button) => {
                button.disabled = true;
            });
        });
        status.textContent = 'READY';
        clock.end(); // Ordinary viewing uses the native pacer; assertions pause it explicitly.
    }
    return { cc, app, scene, ui, camera, canvas, clock, gl, check, pixel, texture, node, button, expose };
}
