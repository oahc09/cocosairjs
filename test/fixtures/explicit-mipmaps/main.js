import { createAirApp, createStepClock, Texture2D, ImageAsset } from '/engine.js';
const result = (window.__mipmaps = { state: 'starting', cases: [], errors: [] });
addEventListener('error', (event) => result.errors.push(String(event.message)));
addEventListener('unhandledrejection', (event) => result.errors.push(String(event.reason)));
const colors = [
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
];
function bytes(size, color) {
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < data.length; i += 4) data.set(color, i);
    return data;
}
function image(size, color, dom = false) {
    if (dom) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(new ImageData(new Uint8ClampedArray(bytes(size, color)), size, size), 0, 0);
        return new ImageAsset(canvas);
    }
    return new ImageAsset({
        width: size,
        height: size,
        format: Texture2D.PixelFormat.RGBA8888,
        _data: bytes(size, color),
        _compressed: false,
    });
}
try {
    await createAirApp({ canvas: '#GameCanvas', pixelRatioCap: 1 });
    const clock = createStepClock();
    clock.begin();
    const gl = document.querySelector('canvas').getContext('webgl2');
    const framebuffer = gl.createFramebuffer();
    const previous = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    for (const kind of ['buffer', 'image', 'packed', 'partial', 'automatic-buffer', 'automatic-image']) {
        for (const order of kind.startsWith('automatic') ? ['before'] : ['before', 'after']) {
            const texture = new Texture2D();
            if (order === 'before') texture.setMipFilter(Texture2D.Filter.LINEAR);
            let count = 3;
            if (kind === 'packed') {
                const data = new Uint8Array(84);
                data.set(bytes(4, colors[0]), 0);
                data.set(bytes(2, colors[1]), 64);
                data.set(bytes(1, colors[2]), 80);
                texture.image = new ImageAsset({
                    width: 4,
                    height: 4,
                    format: Texture2D.PixelFormat.RGBA8888,
                    _data: data,
                    _compressed: false,
                    mipmapLevelDataSize: [64, 16, 4],
                });
            } else if (kind === 'partial') {
                count = 2;
                texture.reset({ width: 4, height: 4, mipmapLevel: count });
                for (let level = 0; level < count; level++) texture.uploadData(bytes(4 >> level, colors[level]), level);
            } else if (kind.startsWith('automatic')) {
                texture.image = image(4, colors[0], kind === 'automatic-image');
            } else {
                texture.mipmaps = colors.map((color, level) => image(4 >> level, color, kind === 'image'));
            }
            if (order === 'after') texture.setMipFilter(Texture2D.Filter.LINEAR);
            const entry = { kind, order, levelCount: texture.mipmapLevel, expectedCount: count, levels: [] };
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            for (let level = 0; level < count; level++) {
                gl.framebufferTexture2D(
                    gl.FRAMEBUFFER,
                    gl.COLOR_ATTACHMENT0,
                    gl.TEXTURE_2D,
                    texture.getGFXTexture().gpuTexture.glTexture,
                    level,
                );
                const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
                const pixels = new Uint8Array((4 >> level) ** 2 * 4);
                gl.readPixels(0, 0, 4 >> level, 4 >> level, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                const expected = colors[kind.startsWith('automatic') ? 0 : level];
                const error = gl.getError();
                entry.levels.push({
                    level,
                    status,
                    error,
                    actual: [...pixels.slice(0, 4)],
                    expected,
                    pass:
                        status === gl.FRAMEBUFFER_COMPLETE &&
                        error === gl.NO_ERROR &&
                        pixels.every((value, index) => value === expected[index % 4]),
                });
            }
            gl.bindFramebuffer(gl.FRAMEBUFFER, previous);
            texture.destroy();
            entry.pass = entry.levelCount === count && entry.levels.every((level) => level.pass);
            result.cases.push(entry);
        }
    }
    gl.deleteFramebuffer(framebuffer);
    result.passed = result.errors.length === 0 && result.cases.every((entry) => entry.pass);
    result.state = 'complete';
} catch (error) {
    result.errors.push(String(error.stack || error));
    result.state = 'failed';
}
