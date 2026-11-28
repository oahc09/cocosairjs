/** One WebGL2 example's diagnostic, not a generic frame recorder. */
import {
    Camera,
    Director,
    director,
    gfx,
    Vec4,
    type AirApp,
    type AirStepClock,
    type AirTransmissionCapture,
    type Material,
} from 'cocosair';
import type { AgentSessionImpl } from './agent-session';
import { captureControlled } from './mcp-review';

type GlassNative = { capture(): AirTransmissionCapture; material(): Material; cameraNode: Camera['node'] };

function observe(app: AirApp, native: GlassNative) {
    const capture = native.capture();
    const material = native.material();
    const texture = capture.sceneColor;
    const main = native.cameraNode.getComponent(Camera);
    const producer =
        texture &&
        app
            .getScene()
            ?.getComponentsInChildren(Camera)
            .find((camera) => camera.targetTexture === texture);
    const liveTexture = texture?.getGFXTexture();
    const pass = material.passes[0];
    const handle = pass?.getHandle('airTransmission');
    const transmission = handle ? pass.getUniform(handle, new Vec4()).x : null;
    const report = {
        transmission,
        captureEnabled: capture.enabledInHierarchy,
        producer: producer
            ? { camera: producer.node.name, priority: producer.priority, enabled: producer.enabledInHierarchy }
            : null,
        consumer: main ? { camera: main.node.name, priority: main.priority, enabled: main.enabledInHierarchy } : null,
        attachment: liveTexture
            ? { format: gfx.Format[liveTexture.format], width: liveTexture.width, height: liveTexture.height }
            : null,
        bindingMatches: !!texture && material.getProperty('cc_sceneColorTex') === texture,
        observedOrder: 'camera-priority' as const,
        readback: 'MISSING_CAPTURE',
        pixels: null as { png: string; width: number; height: number } | null,
    };
    if (!capture.enabledInHierarchy || !producer?.enabledInHierarchy || !texture || !liveTexture) return report;
    const { width, height, format } = liveTexture;
    if (format !== gfx.Format.RGBA8 || width < 1 || height < 1 || width > 640 || height > 480) {
        report.readback = 'UNSUPPORTED_ATTACHMENT';
        return report;
    }
    try {
        // The RenderTexture readback uses WebGL's bottom-left origin. Make the PNG top-left like captureFrame.
        const raw = texture.readPixels(0, 0, width, height);
        if (!raw || raw.length !== width * height * 4) throw new Error('Readback returned no RGBA8 data.');
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: false })!;
        const image = context.createImageData(width, height);
        const stride = width * 4;
        for (let y = 0; y < height; y++)
            image.data.set(raw.subarray(y * stride, (y + 1) * stride), (height - y - 1) * stride);
        context.putImageData(image, 0, 0);
        const png = canvas.toDataURL('image/png');
        if (!png.startsWith('data:image/png;base64,') || png.length > 1398128) throw new Error('Invalid PNG.');
        report.pixels = { png, width, height };
        report.readback = 'AVAILABLE';
    } catch {
        report.readback = 'READBACK_FAILED';
    }
    return report;
}

export async function reviewGlassPasses(app: AirApp, session: AgentSessionImpl, clock: AirStepClock) {
    const native = (window as Window & { __glassNative?: GlassNative }).__glassNative;
    const slider = document.querySelector<HTMLInputElement>('input[type=range][aria-label="transmission"]');
    if (!native || !slider)
        throw Object.assign(new Error('Glass fixture is not ready.'), { code: 'FIXTURE_NOT_READY' });
    const original = slider.value;
    const set = (value: string) => {
        slider.value = value;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const sample = async () => {
        let intermediate: ReturnType<typeof observe> | undefined;
        const onDraw = () => {
            intermediate = observe(app, native);
        };
        director.once(Director.EVENT_AFTER_DRAW, onDraw);
        try {
            const final = await captureControlled(session, clock, 0);
            if (!intermediate) throw new Error('Intermediate did not sample during the controlled AFTER_DRAW.');
            return { final, intermediate };
        } finally {
            director.off(Director.EVENT_AFTER_DRAW, onDraw);
        }
    };
    clock.begin();
    try {
        set('0');
        const control = await sample();
        set('0.95');
        const active = await sample();
        return { control, active };
    } finally {
        try {
            set(original);
        } finally {
            clock.end();
        }
    }
}
