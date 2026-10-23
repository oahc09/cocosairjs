// Independent fail-closed validator. Validating rows is not full U08 acceptance or a performance result.
const { requireDepthPrecision } = require('./upstream-depth-source-audit.cjs');
const frozen = require('../../ai/ledgers/upstream-update/acceptance-manifest.json');
async function validateObservations(probe) {
    const m = await import('../../test/fixtures/upstream-depth-experiments/model.mjs');
    const failures = [],
        diagnostic = [];
    const check = (ok, message) => {
        if (!ok) failures.push(message);
    };
    check(probe?.status === 'OBSERVED_NOT_VALIDATED', 'raw status required');
    check(
        probe?.compositorEvidence === false && probe?.performanceClaim === false,
        'must not claim compositor/performance acceptance',
    );
    check(
        probe?.metadata?.backend === 'webgl2' &&
            /WebGL 2/.test(probe?.metadata?.version) &&
            !!probe?.metadata?.renderer,
        'actual backend/renderer metadata required',
    );
    let selected;
    try {
        selected = m.validateExperiment(probe?.requested);
    } catch (error) {
        check(false, error.message);
    }
    check(probe?.allocated?.framebufferComplete === true, 'complete framebuffer required');
    const expectedBits = selected?.format === 'depth16' ? 16 : selected?.format === 'depth32f' ? 32 : 24;
    check(probe?.allocated?.depthBits === expectedBits, 'actual depth bits required');
    check(
        probe?.allocated?.componentType === (selected?.format === 'depth32f' ? 0x1406 : 0x8c17),
        'actual depth component type required',
    );
    check(
        probe?.allocated?.stencilBits === (selected?.format === 'depth24-stencil8' ? 8 : 0),
        'actual stencil bits required',
    );
    const fragments = (probe?.submittedSources || []).filter(
        (entry) =>
            entry.stage === 0x8b30 &&
            /uniform\s+(?:(?:highp|mediump|lowp)\s+)?sampler2D\s+sceneDepth/.test(entry.source),
    );
    check(fragments.length > 0, 'final submitted depth fragment missing');
    for (const entry of fragments) {
        try {
            requireDepthPrecision(entry.source, ['sceneDepth']);
        } catch (error) {
            check(false, error.message);
        }
        check(/precision highp int;/.test(entry.source), 'float-bit encoding requires highp integer precision');
    }
    const pixels = (bytes) =>
        Array.isArray(bytes) && bytes.length === 4 && bytes.every((v) => Number.isInteger(v) && v >= 0 && v <= 255);
    const unpack = (bytes, label) => {
        if (!pixels(bytes)) {
            check(false, `${label}: invalid pixels`);
            return NaN;
        }
        const value = m.decodeFloat(bytes);
        check(Number.isFinite(value), `${label}: nonfinite sample`);
        return value;
    };
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const rows = probe?.rows || [];
    if (probe?.schema === 'air-upstream-native-depth/1') {
        check(selected?.pipeline === 'native-target', 'native pipeline identity');
        check(probe?.glError === 0, 'native GL error');
        check(probe?.allocated?.engineInternalFormat === 0x88f0, 'native D24S8 internal format');
        check(rows.length === 9, 'all nine native depth rows required');
        for (const [near, far] of [
            [0.1, 100],
            [1, 1000],
            [10, 10000],
        ])
            for (const distance of [near * 2, Math.sqrt(near * far), far * 0.5]) {
                const matches = rows.filter((row) => row.near === near && row.far === far && row.distance === distance);
                check(matches.length === 1, `native unique row ${near}/${far}/${distance}`);
                const row = matches[0];
                if (!row) continue;
                const stored = unpack(row.depthBytes, 'native depth');
                const reconstructed = unpack(row.reconstructedBytes, 'native reconstruction');
                check(
                    stored >= 0 &&
                        stored <= 1 &&
                        Math.abs(stored - m.depthAt(distance, near, far)) <= frozen.thresholds.cpuAbsoluteError,
                    'native projected depth differs from independent oracle',
                );
                check(
                    same(row.depth, stored) && same(row.reconstructed, reconstructed),
                    'decoded depth fields disagree with raw bytes',
                );
                check(row.clearDepth === 1 && row.depthFunction === 1, 'native default clear/LESS changed');
                check(
                    Array.isArray(row.projection) && row.projection.length === 16,
                    'actual native projection missing',
                );
                const expectedProjection = m.projection(near, far);
                check(
                    [10, 11, 14, 15].every(
                        (i) =>
                            Number.isFinite(row.projection?.[i]) &&
                            Math.abs(row.projection[i] - expectedProjection[i]) <= frozen.thresholds.cpuAbsoluteError,
                    ),
                    'native projection depth coefficients altered',
                );
                check(row.comparisons?.length === 3, 'all three comparisons required');
                for (const [label, offset, bias, expected] of [
                    ['below', -(2 ** -18), 0, 255],
                    ['above', 2 ** -18, 0, 0],
                    ['bias', 2 ** -18, 2 ** -17, 255],
                ]) {
                    const entries = row.comparisons?.filter((v) => v.label === label) || [],
                        entry = entries[0];
                    check(
                        entries.length === 1 &&
                            entry.referenceDepth === Math.fround(m.depthAt(distance, near, far) + offset) &&
                            entry.bias === bias,
                        'native comparison input altered',
                    );
                    check(
                        pixels(entry?.pixels) && entry.pixels[0] === expected && entry.pixels[3] === 255,
                        `native comparison ${label}`,
                    );
                }
                diagnostic.push({
                    near,
                    far,
                    distance,
                    depthAbsoluteError: Math.abs(stored - m.depthAt(distance, near, far)),
                    reconstructionAbsoluteError: Math.abs(reconstructed - distance),
                    note: 'Reconstruction error is measured, not a new relaxed acceptance threshold.',
                });
            }
    } else if (probe?.schema === 'air-upstream-depth-experiment/1') {
        check(probe?.glError === 0, 'isolated GL error');
        check(
            selected?.pipeline === 'isolated' && probe.runtimeIntegrated === false,
            'isolated diagnostic must not claim native support',
        );
        check(rows.length === 18, 'all eighteen isolated rows required');
        for (const { near, far } of m.ranges)
            for (const pair of m.pairs(near, far)) {
                const id = `${near}/${far}/${pair.id}`,
                    matches = rows.filter((row) => row.id === id),
                    row = matches[0];
                check(matches.length === 1, `isolated unique row ${id}`);
                if (!row) continue;
                check(
                    row.near === near &&
                        row.far === far &&
                        same(row.distances, pair.distances) &&
                        row.mode === selected?.mode,
                    `isolated inputs ${id}`,
                );
                check(
                    same(row.convention, m.convention(selected?.mode)),
                    `projection/clear/compare/reconstruction convention ${id}`,
                );
                check(
                    same(row.projectionFloat32, Array.from(new Float32Array(m.projection(near, far, selected.mode)))),
                    `actual uploaded projection ${id}`,
                );
                check(row.single?.length === 2 && row.orders?.length === 2, `singles and both orders required ${id}`);
                if (row.single?.length !== 2 || row.orders?.length !== 2) continue;
                const depths = row.single.map((v, i) => {
                    const depth = unpack(v.depth?.bytes, `${id}/single-${i}`);
                    check(
                        depth >= 0 &&
                            depth <= 1 &&
                            Math.abs(depth - m.depthAt(pair.distances[i], near, far, selected.mode)) <=
                                frozen.thresholds.cpuAbsoluteError,
                        `projected depth ${id}/${i}`,
                    );
                    return depth;
                });
                const red = [255, 0, 0, 255],
                    blue = [0, 0, 255, 255];
                // Equal quantized depths legitimately preserve first draw under strict LESS/GREATER.
                const nearWins = selected.mode === 'normal' ? depths[0] < depths[1] : depths[0] > depths[1];
                const tie = depths[0] === depths[1];
                check(
                    same(row.orders[0].color, nearWins || tie ? red : blue) &&
                        same(row.orders[1].color, nearWins ? red : blue),
                    `depth comparison order ${id}`,
                );
                diagnostic.push({
                    id,
                    tied: tie,
                    idealDepthSeparation: Math.abs(
                        m.depthAt(pair.distances[0], near, far, selected.mode) -
                            m.depthAt(pair.distances[1], near, far, selected.mode),
                    ),
                    observedDepthSeparation: Math.abs(depths[0] - depths[1]),
                    reconstructionAbsoluteErrors: row.single.map((v, i) =>
                        Math.abs(unpack(v.reconstructed?.bytes, `${id}/reconstruction`) - pair.distances[i]),
                    ),
                });
            }
    } else check(false, 'unknown observation schema');
    return {
        status: failures.length ? 'FAIL' : 'PASS',
        scope: 'diagnostic row integrity and mathematical comparisons only',
        acceptanceConclusion: 'BLOCKED',
        failures,
        diagnostic,
        reason: 'A validated diagnostic alone cannot establish unchanged default scenes, complete browser/device matrix, shadow compatibility, full engine Reverse-Z, or performance benefit.',
    };
}
module.exports = { validateObservations };
if (require.main === module) {
    const fs = require('node:fs');
    if (process.argv.includes('--help'))
        console.log('node tools/verify/upstream-experiments-observations.cjs <raw-observations.json>');
    else
        validateObservations(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')))
            .then((result) => {
                console.log(JSON.stringify(result, null, 2));
                process.exitCode = result.status === 'PASS' ? 0 : 1;
            })
            .catch((error) => {
                console.error(error.stack);
                process.exitCode = 1;
            });
}
