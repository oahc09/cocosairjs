const { PNG } = require('pngjs');
const crypto = require('node:crypto');
const { SCENE_KINDS } = require('./scene-contract.cjs');

// Fixed image policies; independent of the scene's own CPU/state assertions.
function verifyScenePresentation(bytes, kind, { phase, previousBytes } = {}) {
    if (!SCENE_KINDS.includes(kind) || !['before', 'after'].includes(phase)) throw Error('Unknown scene capture');
    const png = PNG.sync.read(bytes);
    if (png.width !== 320 || png.height !== 240) throw Error('Scene capture must have 320x240 physical pixels');
    const previous = previousBytes ? PNG.sync.read(previousBytes) : null;
    if (previous && (previous.width !== png.width || previous.height !== png.height))
        throw Error('Scene dimensions changed');
    const result = {
        pass: false,
        status: 'FAIL',
        phase,
        width: png.width,
        height: png.height,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        subjectPixels: 0,
        changedPixels: 0,
        textPixels: 0,
        textChangedPixels: 0,
        spriteBluePixels: 0,
        spriteWarmPixels: 0,
        spriteInteriorSamples: 0,
        redPixels: 0,
        greenPixels: 0,
        textureGreenPixels: 0,
        textureCyanPixels: 0,
    };
    for (let y = 2; y < png.height - 2; y++)
        for (let x = 2; x < png.width - 2; x++) {
            const offset = (y * png.width + x) * 4;
            const [r, g, b, a] = png.data.subarray(offset, offset + 4);
            const changed =
                previous &&
                Math.max(...[0, 1, 2].map((i) => Math.abs(png.data[offset + i] - previous.data[offset + i]))) > 25;
            if (changed) result.changedPixels++;
            if (a < 250) continue;
            if (Math.max(Math.abs(r - 20), Math.abs(g - 40), Math.abs(b - 80)) > 16) result.subjectPixels++;
            if (r > 160 && r - g > 70 && r - b > 70) result.redPixels++;
            if (g > 140 && g - r > 70 && g - b > 70) result.greenPixels++;
            if (g >= 60 && g - r > 15 && g - b > 15) result.textureGreenPixels++;
            if (g >= 70 && g - r > 15 && b - r > 20 && b - g > 10) result.textureCyanPixels++;
            if (x >= 30 && x < 290 && y >= 28 && y < 100) {
                if (Math.min(r, g, b) >= 180 && Math.max(r, g, b) - Math.min(r, g, b) < 45) result.textPixels++;
                if (changed) result.textChangedPixels++;
            }
            if (x >= 80 && x < 240 && y >= 137 && y < 193) {
                if (b - r > 50 && b - g > 50 && g >= 60) result.spriteBluePixels++;
                if (r >= 160 && r - g > 80 && r - b > 80) result.spriteWarmPixels++;
                if (
                    [83, 120, 160, 200, 236].includes(x) &&
                    [140, 165, 189].includes(y) &&
                    (phase === 'before' ? b - r > 50 && b - g > 50 && g >= 60 : r >= 160 && r - g > 80 && r - b > 80)
                )
                    result.spriteInteriorSamples++;
            }
        }
    result.pass =
        result.subjectPixels >= 64 && (phase === 'before' || (previous !== null && result.changedPixels >= 32));
    if (kind === 'scene-ui')
        result.pass &&=
            result.textPixels >= 60 &&
            result.textPixels < 4000 &&
            result.spriteInteriorSamples === 15 &&
            (phase === 'before'
                ? result.spriteBluePixels >= 1000
                : result.spriteWarmPixels >= 1000 && result.textChangedPixels >= 40);
    if (kind === 'scene-compute')
        result.pass &&= phase === 'before' ? result.redPixels >= 64 : result.greenPixels >= 64;
    if (kind === 'scene-pbr' && phase === 'before')
        result.pass &&= result.textureGreenPixels >= 100 && result.textureCyanPixels >= 100;
    result.status = result.pass ? 'PASS' : 'FAIL';
    return result;
}
module.exports = { verifyScenePresentation };
