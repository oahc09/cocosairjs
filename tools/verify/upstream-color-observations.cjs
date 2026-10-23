// Fail-closed, independent validation of raw U03 GPU observations. No browser/engine imports.
const reference = require('../../test/fixtures/upstream-color-contract/reference.cjs');
const frozen = require('../../test/fixtures/upstream-color-contract/vectors.json');
const { requireDepthPrecision } = require('./upstream-depth-source-audit.cjs');
function validateObservations(probe) {
    const failures = [];
    const check = (condition, message) => {
        if (!condition) failures.push(message);
    };
    const checkPixels = (row, expected, count) => {
        const pixels = row?.pixels;
        check(Array.isArray(pixels) && pixels.length === count * 4, `pixels shape: ${row?.id}`);
        if (!Array.isArray(pixels)) return;
        pixels.forEach((value, i) =>
            check(
                Number.isInteger(value) &&
                    value >= 0 &&
                    value <= 255 &&
                    Math.abs(value / 255 - reference.clamp(expected[i % 4])) <= frozen.rgba8AbsoluteError,
                `pixel ${row.id}[${i}]: ${value}`,
            ),
        );
    };
    const rows = (probe?.engine?.rows || []).concat(probe?.isolated?.rows || []);
    const take = (kind, id) => {
        const found = rows.filter((row) => row.kind === kind && row.id === id);
        check(found.length === 1, `expected exactly one ${kind}/${id}`);
        return found[0];
    };
    check(probe?.schemaVersion === 1 && probe?.status === 'OBSERVED_NOT_VALIDATED', 'raw observation schema/status');
    check(probe?.compositorEvidence === false, 'must not claim compositor proof');
    check(typeof probe?.engine?.renderer === 'string' && !!probe.engine.renderer, 'actual renderer missing');
    check(
        typeof probe?.engine?.version === 'string' && /WebGL 2/.test(probe.engine.version),
        'actual WebGL2 version missing',
    );
    check(
        Array.isArray(probe?.engine?.glErrors) && probe.engine.glErrors.length === 0,
        'engine GL errors missing or nonzero',
    );
    check(
        Array.isArray(probe?.isolated?.glErrors) && probe.isolated.glErrors.length === 0,
        'isolated GL errors missing or nonzero',
    );
    check(probe?.isolated?.highFloat?.precision >= 16, 'fragment highp precision missing');
    check(rows.length === frozen.vectors.length * 2 + 14, 'unexpected/missing row count');
    for (const toneMapping of ['default', 'linear'])
        for (const vector of frozen.vectors) {
            const row = take('native-output', `${toneMapping}/${vector.id}`);
            check(
                JSON.stringify(row?.input) === JSON.stringify(vector.rgba),
                `frozen input changed: ${toneMapping}/${vector.id}`,
            );
            check(row?.toneMapping === toneMapping, `tone mapper changed: ${row?.id}`);
            check(row?.pipelineMacros?.CC_USE_HDR === true, `HDR macro not active: ${row?.id}`);
            check(
                row?.pipelineMacros?.CC_TONE_MAPPING_TYPE === (toneMapping === 'default' ? 0 : 1),
                `tone macro mismatch: ${row?.id}`,
            );
            check(!row?.pipelineMacros?.CC_USE_FLOAT_OUTPUT, `float output unexpectedly enabled: ${row?.id}`);
            if (row) checkPixels(row, reference.output(vector.rgba, { toneMapping }), 16);
        }
    for (const mode of ['none', 'shader-srgb', 'hardware-srgb']) {
        const row = take('texture-decode', mode);
        check(
            JSON.stringify(row?.bytes) === '[128,64,192,102]' && row?.mode === mode,
            `decode fixture changed: ${mode}`,
        );
        if (row)
            checkPixels(
                row,
                reference.decodeRGBA(
                    [128, 64, 192, 102].map((v) => v / 255),
                    mode,
                ),
                1,
            );
    }
    for (const id of ['straight', 'premultiplied']) {
        const row = take('linear-blend', id);
        check(
            JSON.stringify(row?.input) === '[0.2,0.4,0.6,0.25]' &&
                JSON.stringify(row?.destination) === '[0.1,0.2,0.3,0.8]',
            `blend fixture changed: ${id}`,
        );
        if (row) checkPixels(row, reference.sourceOver([0.2, 0.4, 0.6, 0.25], [0.1, 0.2, 0.3, 0.8]), 1);
    }
    for (const depth of [0.125, 0.5, 0.875])
        for (const [label, offset, bias] of [
            ['below', -(2 ** -20), 0],
            ['above', 2 ** -20, 0],
            ['bias', 2 ** -20, 2 ** -19],
        ]) {
            const row = take('depth24-compare', `${depth}/${label}`);
            check(
                row?.depth === depth && row?.referenceDepth === depth + offset && row?.bias === bias,
                `depth fixture changed: ${depth}/${label}`,
            );
            if (row) checkPixels(row, [label === 'above' ? 0 : 1, depth, 0, 1], 1);
        }
    const submitted = probe?.submittedSources || [];
    const depthSources = submitted.filter((entry) => entry.source?.includes('uniform vec2 compareParams;'));
    check(depthSources.length === 1, 'actual depth shaderSource capture missing/duplicated');
    for (const entry of depthSources) {
        try {
            requireDepthPrecision(entry.source, ['sceneDepth']);
        } catch (error) {
            failures.push(error.message);
        }
    }
    check(
        submitted.some(
            (entry) =>
                entry.source?.startsWith('#version 300 es\n') &&
                entry.source.includes('vec4 CCFragOutput') &&
                entry.source.includes('vec3 ACESToneMap'),
        ),
        'actual native color shaderSource missing',
    );
    return {
        status: failures.length ? 'FAIL' : 'PASS',
        scope: 'focused-webgl2-color-depth-readback',
        rows: rows.length,
        cpuAbsoluteError: frozen.cpuAbsoluteError,
        rgba8AbsoluteError: frozen.rgba8AbsoluteError,
        failures,
        compositorEvidence: false,
    };
}
module.exports = { validateObservations };
