const test = require('node:test'),
    assert = require('node:assert/strict');
const { validate, iors } = require('./upstream-material-transitions-observations.cjs');
function fixture() {
    const image = (offset) =>
        Array.from({ length: 96 * 96 * 4 }, (_, i) => (i % 4 === 3 ? 255 : 20 + (i % 37) + offset));
    const before = image(0),
        after = image(20),
        state = (ior) => ({
            albedo: [0.22, 0.68, 0.38, 1],
            uv0: [1, 0, 0, 0],
            uv1: [0, 1, 0, 0],
            iridescence: [0.95, ior, 80, 670],
        });
    return {
        schema: 'upstream-material-transitions/1',
        status: 'OBSERVED_NOT_VALIDATED',
        width: 96,
        height: 96,
        samples: 1,
        toleranceBytes: 2,
        roi: 'full RGBA8 target; no post-hoc edge exclusion',
        glError: 0,
        renderer: 'synthetic unit fixture only',
        version: 'WebGL 2 unit',
        rows: [false, true].flatMap((textured) =>
            iors.map((ior) => ({
                id: `${textured ? 'RG-textured' : 'constant'}/${ior}`,
                textured,
                ior,
                initialPixels: before,
                mutatedPixels: after,
                freshPixels: after,
                mutatedState: state(ior),
                freshState: state(ior),
            })),
        ),
        semantics: [
            'linear-red-factor-green-thickness',
            'missing-texture-uses-maximum',
            'film-independent-of-volume-thickness',
        ].map((id) => ({
            id,
            leftPixels: after,
            rightPixels: after,
            oracle: { rgba: [64, 192, 128, 255], factor: (0.8 * 64) / 255, thickness: 80 + (590 * 192) / 255 },
        })),
        checks: [
            'capture-live-texture',
            'second-capture-rejected',
            'disable-restores-bindings',
            'destroy-restores-bindings',
        ].map((name) => ({ name, pass: true })),
        restoration: {
            baselinePixels: before,
            activePixels: after,
            disabledPixels: before,
            reenabledPixels: after,
            destroyedPixels: before,
            recreatedPixels: after,
            disabledBindings: [{ layerRestored: true, textureRestored: true, infoRestored: true }],
            destroyedBindings: [{ layerRestored: true, textureRestored: true, infoRestored: true }],
            rejection: 'only one capture',
        },
    };
}
test('synthetic validator control is not browser evidence', () => assert.equal(validate(fixture()).validated, true));
for (const kind of [
    'blank',
    'incomplete-pair',
    'changed-pixel',
    'changed-restoration',
    'invisible-mutation',
    'missing-binding',
    'missing-negative',
    'relaxed-tolerance',
    'missing-check',
    'gl-error',
    'changed-channel-oracle',
    'missing-semantics',
])
    test('reject ' + kind, () => {
        const r = fixture();
        if (kind === 'blank') r.rows[0].mutatedPixels = new Array(96 * 96 * 4).fill(0);
        if (kind === 'incomplete-pair') r.rows.pop();
        if (kind === 'changed-pixel') {
            r.rows[0].freshPixels = [...r.rows[0].freshPixels];
            r.rows[0].freshPixels[123] = 0;
        }
        if (kind === 'changed-restoration') r.restoration.disabledPixels = r.restoration.activePixels;
        if (kind === 'invisible-mutation') r.rows[0].initialPixels = r.rows[0].mutatedPixels;
        if (kind === 'missing-binding') r.restoration.disabledBindings[0].textureRestored = false;
        if (kind === 'missing-negative') r.restoration.rejection = null;
        if (kind === 'relaxed-tolerance') r.toleranceBytes = 3;
        if (kind === 'missing-check') r.checks.pop();
        if (kind === 'changed-channel-oracle') r.semantics[0].oracle.factor = (0.8 * 192) / 255;
        if (kind === 'missing-semantics') r.semantics.pop();
        if (kind === 'gl-error') r.glError = 1282;
        assert.throws(() => validate(r));
    });
