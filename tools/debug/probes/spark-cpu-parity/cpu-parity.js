/**
 * SPK-13 CPU-parity harness — measurement only, judgement lives in tools/verify/spark-cpu-parity.cjs.
 *
 * Re-runs the port repo's `tests/data-parity.mjs` `cpu-package/*` family against the artifact THIS repo
 * actually ships: the Spark body inside `build/cocosair.module.spark.js` (`cc.sparkRuntime`) compared
 * with the prebuilt upstream package `dist/spark-reference.js`, in a browser. Nothing is rendered: the
 * functions under test are pure CPU bit codecs, so this probe adds no GPU-dependent claim.
 */
const parameters = new URLSearchParams(location.search);
const SDK = window.__SPARK_CPU_SDK || parameters.get('sdk') || '/build/cocosair.module.spark.js';
const REFERENCE = parameters.get('reference') || '/dist/spark-reference.js';

window.__sparkCpuParity = { ready: false, fatal: null, result: null };
window.__errors = [];
window.addEventListener('error', (event) => window.__errors.push('error: ' + String(event.message)));
window.addEventListener('unhandledrejection', (event) =>
    window.__errors.push('unhandledrejection: ' + String(event.reason)),
);

const status = (text) => {
    const node = document.getElementById('status');
    if (node) node.textContent = text;
};

// The half-codec boundary set from the port test: signed zeros, subnormals, the half exponent edges,
// the value that rounds exactly at the half ulp, the max finite half, the overflow cliff, and the
// non-finite trio.
const HALF_EDGES = [
    0,
    -0,
    Number.MIN_VALUE,
    -Number.MIN_VALUE,
    2 ** -24,
    2 ** -14,
    1,
    1.00048828125,
    65504,
    65520,
    1e10,
    Infinity,
    -Infinity,
    NaN,
];

// Same 256 boundary vectors as the port test: centre, scale sweep spanning 1e-15..1e5, a unit quaternion
// sweeping through sin/cos, and colour components crossing zero.
function boundaryArgs(i) {
    const q = [0, 0, Math.sin((i / 256) * Math.PI), Math.cos((i / 256) * Math.PI)];
    return [
        i === 0 ? -0 : (i - 128) / 7,
        (i % 17) / 9,
        -i / 32,
        [0, 1e-15, Math.exp(-12), 1, Math.exp(9), 1e5][i % 6],
        0.05,
        0.08,
        ...q,
        i / 128 - 0.5,
        i / 64 - 1,
        0.25,
        0.75,
    ];
}

const UNPACK_FIELDS = {
    center: ['x', 'y', 'z'],
    scales: ['x', 'y', 'z'],
    quaternion: ['x', 'y', 'z', 'w'],
    color: ['r', 'g', 'b'],
};

const wordDiff = (a, b) => {
    let n = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
    return n;
};

async function boot() {
    status(`importing ${SDK} and ${REFERENCE}`);
    // Import-time canvas pre-registration, exactly as the pixel-parity target document does it. The
    // engine would otherwise throw before exposing cc.sparkRuntime.
    globalThis.__CC_CANVAS__ = document.getElementById('view');
    globalThis.__CCDPR_CAP__ = 1;
    const bundle = await import(SDK);
    const sparkRuntime = bundle.sparkRuntime;
    if (!sparkRuntime || typeof sparkRuntime.fromHalf !== 'function') {
        throw new Error('bundle has no cc.sparkRuntime.fromHalf - the Spark body is not in this build');
    }
    const reference = await import(REFERENCE);

    const namespaces = ['dyno', 'utils', 'defines', 'generators', 'modifiers'];
    const namespaceKeys = {};
    for (const name of namespaces) {
        namespaceKeys[name] = {
            reference: Object.keys(reference[name] || {}).sort(),
            target: Object.keys(sparkRuntime[name] || {}).sort(),
        };
    }
    const callables = ['fromHalf', 'toHalf', 'setPackedSplat', 'unpackSplat'];
    const typeofSurface = {};
    for (const name of callables) {
        typeofSurface[name] = {
            reference: typeof reference[name],
            target: typeof sparkRuntime[name],
            referenceLength: reference[name]?.length ?? null,
            targetLength: sparkRuntime[name]?.length ?? null,
        };
    }
    typeofSurface.encodeExtSplat = {
        reference: typeof reference.utils?.encodeExtSplat,
        target: typeof sparkRuntime.utils?.encodeExtSplat,
        referenceLength: reference.utils?.encodeExtSplat?.length ?? null,
        targetLength: sparkRuntime.utils?.encodeExtSplat?.length ?? null,
    };

    // fromHalf over every 16-bit pattern. Object.is so -0/NaN agree exactly with the frozen code.
    let halfCompared = 0;
    let halfMismatches = 0;
    let halfFirstMismatch = null;
    for (let bits = 0; bits < 65536; bits++) {
        const expected = reference.fromHalf(bits);
        const actual = sparkRuntime.fromHalf(bits);
        halfCompared++;
        if (!Object.is(expected, actual)) {
            halfMismatches++;
            if (!halfFirstMismatch) halfFirstMismatch = { bits, expected, actual };
        }
    }

    // toHalf over the boundary values: compare the returned 16-bit codes exactly.
    const toHalfEdges = [];
    let toHalfMismatches = 0;
    for (const value of HALF_EDGES) {
        const expected = reference.toHalf(value);
        const actual = sparkRuntime.toHalf(value);
        const equal = Object.is(expected, actual);
        if (!equal) toHalfMismatches++;
        toHalfEdges.push({ value: String(value), expected, actual, equal });
    }

    // setPackedSplat / unpackSplat / utils.encodeExtSplat over the 256 boundary vectors.
    let packedCompared = 0;
    const packed = { setWords: 0, extWords: 0, unpackFields: 0, first: null };
    for (let i = 0; i < 256; i++) {
        const args = boundaryArgs(i);
        const expected = new Uint32Array(4);
        const actual = new Uint32Array(4);
        reference.setPackedSplat(expected, 0, ...args);
        sparkRuntime.setPackedSplat(actual, 0, ...args);
        const extExpected = [new Uint32Array(4), new Uint32Array(4)];
        const extActual = [new Uint32Array(4), new Uint32Array(4)];
        reference.utils.encodeExtSplat(extExpected, 0, ...args);
        sparkRuntime.utils.encodeExtSplat(extActual, 0, ...args);
        const unpackedExpected = reference.unpackSplat(expected, 0);
        const unpackedActual = sparkRuntime.unpackSplat(actual, 0);
        packedCompared++;
        const setWords = wordDiff(expected, actual);
        const extWords = wordDiff(extExpected[0], extActual[0]) + wordDiff(extExpected[1], extActual[1]);
        let unpackFields = 0;
        for (const [group, axes] of Object.entries(UNPACK_FIELDS)) {
            for (const axis of axes) {
                if (!Object.is(unpackedExpected[group]?.[axis], unpackedActual[group]?.[axis])) unpackFields++;
            }
        }
        if (!Object.is(unpackedExpected.opacity, unpackedActual.opacity)) unpackFields++;
        packed.setWords += setWords;
        packed.extWords += extWords;
        packed.unpackFields += unpackFields;
        if (!packed.first && setWords + extWords + unpackFields > 0) {
            packed.first = { i, args: args.map(String), expected: [...expected], actual: [...actual] };
        }
    }

    // Negative controls: the same comparison loops must be able to cry wolf. Offsetting the half input
    // by one pattern is one proof; the other shifts a packed splat by MORE than the codec's own
    // quantisation step (a 1e-3 centre nudge rounds back to the same words - that is a fact about the
    // format, so the control also measures its own perturbation against the untouched vector).
    let controlHalfMismatches = 0;
    for (let bits = 0; bits < 65536; bits++) {
        if (!Object.is(reference.fromHalf((bits + 1) & 0xffff), sparkRuntime.fromHalf(bits))) controlHalfMismatches++;
    }
    const perturbed = boundaryArgs(7);
    perturbed[0] += 0.5;
    perturbed[13] = 0.9;
    const controlExpected = new Uint32Array(4);
    const controlActual = new Uint32Array(4);
    const controlPlain = new Uint32Array(4);
    reference.setPackedSplat(controlExpected, 0, ...perturbed);
    sparkRuntime.setPackedSplat(controlActual, 0, ...perturbed);
    reference.setPackedSplat(controlPlain, 0, ...boundaryArgs(7));
    const controlPackedWords = wordDiff(controlExpected, controlActual);
    const controlOwnCodecWords = wordDiff(controlExpected, controlPlain);
    // `unpackSplat` fills a per-module reusable record, so two calls on the SAME module alias each
    // other. The control therefore snapshots the fields before reading the second vector.
    const controlUnpackFields = (() => {
        const snapshot = (u) => {
            const out = { opacity: u?.opacity };
            for (const [group, axes] of Object.entries(UNPACK_FIELDS)) out[group] = axes.map((a) => u?.[group]?.[a]);
            return out;
        };
        const moved = snapshot(reference.unpackSplat(controlExpected, 0));
        const plain = snapshot(reference.unpackSplat(controlPlain, 0));
        let n = 0;
        for (const group of Object.keys(UNPACK_FIELDS)) {
            for (let i = 0; i < UNPACK_FIELDS[group].length; i++) if (!Object.is(moved[group][i], plain[group][i])) n++;
        }
        return n + (Object.is(moved.opacity, plain.opacity) ? 0 : 1);
    })();
    const controlUnpackAliasing = (() => {
        const a = reference.unpackSplat(controlExpected, 0);
        const shared = reference.unpackSplat(controlPlain, 0);
        return { returnsSharedRecord: a === shared, movedCenterX: a?.center?.x !== undefined };
    })();
    // And the same perturbation shape through the real comparison must report zero: the control proves
    // sensitivity, not a defect in the compared implementations.
    const controlUnperturbedWords = (() => {
        const a = new Uint32Array(4);
        const b = new Uint32Array(4);
        const args = boundaryArgs(7);
        reference.setPackedSplat(a, 0, ...args);
        sparkRuntime.setPackedSplat(b, 0, ...args);
        return wordDiff(a, b);
    })();

    window.__sparkCpuParity.result = {
        documents: { sdk: SDK, reference: REFERENCE, userAgent: navigator.userAgent },
        names: { reference: Object.keys(reference).sort(), target: Object.keys(sparkRuntime).sort() },
        typeofSurface,
        namespaceKeys,
        checks: {
            fromHalf: { compared: halfCompared, mismatches: halfMismatches, firstMismatch: halfFirstMismatch },
            toHalf: { compared: toHalfEdges.length, mismatches: toHalfMismatches, edges: toHalfEdges },
            packed: { compared: packedCompared, ...packed },
        },
        negativeControls: {
            fromHalfOffsetOneMismatches: controlHalfMismatches,
            perturbationOwnCodecWordMismatches: controlOwnCodecWords,
            perturbationUnpackFieldMismatches: controlUnpackFields,
            crossImplAgreementOnPerturbedVector: controlPackedWords,
            packedUnperturbedWordMismatches: controlUnperturbedWords,
            unpackAliasing: controlUnpackAliasing,
        },
    };
    window.__sparkCpuParity.errors = window.__errors.slice();
    window.__sparkCpuParity.ready = true;
    status('ready');
}

boot().catch((error) => {
    window.__sparkCpuParity.fatal = String((error && (error.stack || error.message)) || error);
    window.__sparkCpuParity.errors = window.__errors.slice();
    status('FATAL ' + window.__sparkCpuParity.fatal);
});
