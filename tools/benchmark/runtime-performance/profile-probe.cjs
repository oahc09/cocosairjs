/* Stage a diagnostic S01/S02-only shader-table variant, not a supported runtime profile. */
const fs = require('node:fs');
const path = require('node:path');
const { digest, identity, writeNew } = require('./evidence.cjs');

const EXCLUDED = Object.freeze([
    'air-gltf-template',
    'builtin-terrain',
    'pipeline/bloom',
    'pipeline/deferred-lighting',
]);
const BUILTIN = [
    { file: 'builtin-effects.ts', symbol: 'effects' },
    { file: 'builtin-glsl4.ts', symbol: 'glsl4' },
];

function parseData(source, symbol) {
    const marker = `export const ${symbol} = `;
    const start = source.indexOf(marker);
    if (start < 0 || source.indexOf(marker, start + marker.length) >= 0) throw new Error('Unexpected generated table');
    const payload = source.slice(start + marker.length).trimEnd();
    if (!payload.endsWith(';')) throw new Error('Unexpected generated payload');
    return {
        prefix: source.slice(0, start + marker.length),
        data: JSON.parse(payload.slice(0, -1)),
    };
}

function select(effects, stages) {
    if (!Array.isArray(effects) || !Array.isArray(stages) || effects.length !== stages.length)
        throw new Error('Effect and stage table lengths differ');
    const names = new Set();
    const retained = [];
    for (let i = 0; i < effects.length; i++) {
        const effect = effects[i];
        const row = stages[i];
        if (
            typeof effect?.name !== 'string' ||
            names.has(effect.name) ||
            !Array.isArray(effect.shaders) ||
            !Array.isArray(row) ||
            row.length !== effect.shaders.length ||
            row.some((stage) => !stage || typeof stage.vert !== 'string' || typeof stage.frag !== 'string')
        )
            throw new Error(`Mismatched or duplicate effect/stage row at ${i}`);
        names.add(effect.name);
        if (!EXCLUDED.includes(effect.name)) retained.push({ name: effect.name, effect, stages: row });
    }
    for (const name of EXCLUDED) if (!names.has(name)) throw new Error(`Exclusion no longer exists: ${name}`);
    for (const name of ['builtin-unlit', 'builtin-standard', 'builtin-clear-stencil', 'builtin-sprite']) {
        if (!retained.some((entry) => entry.name === name))
            throw new Error(`Required material effect missing: ${name}`);
    }
    return retained;
}

function stage(input, out) {
    const entries = BUILTIN.map((entry) => {
        const source = fs.readFileSync(path.join(input, entry.file), 'utf8');
        return { ...entry, ...parseData(source, entry.symbol), inputSha256: digest(source) };
    });
    const retained = select(entries[0].data, entries[1].data);
    const outputs = [retained.map((entry) => entry.effect), retained.map((entry) => entry.stages)];
    fs.mkdirSync(out);
    const sources = entries.map((entry, index) => {
        const bytes = Buffer.from(entry.prefix + JSON.stringify(outputs[index], null, 2) + ';\n');
        fs.writeFileSync(path.join(out, entry.file), bytes, { flag: 'wx' });
        return { file: entry.file, inputSha256: entry.inputSha256, output: identity(bytes) };
    });
    writeNew(path.join(out, 'receipt.json'), {
        scope: 'S01/S02 experimental effect removal; no effect, package or renderer compatibility claim',
        retained: retained.map((entry) => entry.name),
        excluded: EXCLUDED,
        sources,
    });
}

// Translate only two exact, source-bound top-level JSON initializers. Keep this
// diagnostic separate from the generated-source drift gate and distribution.
function makeBundle(root, input, bundle, out) {
    const { verifySourceBinding } = require('../../build/source-binding.cjs');
    const { stripRuntimeSourceMap } = require('../../build/runtime-layout.cjs');
    const proof = verifySourceBinding(root, bundle);
    if (!proof.matches) throw new Error('Unbound runtime input');
    const contents = fs.readFileSync(bundle, 'utf8');
    const original = BUILTIN.map(
        ({ file, symbol }) => parseData(fs.readFileSync(path.join(input, file), 'utf8'), symbol).data,
    );
    const retained = select(...original);
    const variants = [retained.map((r) => r.effect), retained.map((r) => r.stages)];
    const targets = original.map((data) => JSON.stringify(data));
    const edits = [];
    // The development compiler emits generated data on its own line as compact
    // JSON. Refuse any other shape instead of guessing which syntax to replace.
    for (const match of contents.matchAll(/^const [A-Za-z_$][\w$]*=(\[[^\r\n]*\]);$/gm)) {
        let value;
        try {
            value = JSON.stringify(JSON.parse(match[1]));
        } catch {
            continue;
        }
        const target = targets.indexOf(value);
        if (target < 0) continue;
        const start = match.index + match[0].indexOf('=') + 1;
        edits.push({ start, end: start + match[1].length, target });
    }
    if (edits.length !== 2 || new Set(edits.map((edit) => edit.target)).size !== 2)
        throw new Error('Did not find exactly two original generated initializers');
    let changed = contents;
    for (const { start, end, target } of edits.sort((a, b) => b.start - a.start))
        changed = changed.slice(0, start) + JSON.stringify(variants[target]) + changed.slice(end);
    changed = stripRuntimeSourceMap(changed);
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, 'runtime-probe.mjs'), changed, { flag: 'wx' });
    writeNew(path.join(out, 'receipt.json'), {
        scope: 'post-build diagnostic only; excludes effects and is not a package or release candidate',
        sourceBindingSha256: proof.receiptSha256,
        original: identity(Buffer.from(stripRuntimeSourceMap(contents))),
        variant: identity(Buffer.from(changed)),
        retained: retained.map((entry) => entry.name),
        excluded: EXCLUDED,
    });
}

if (require.main === module) {
    try {
        const [input, out, bundle, ...rest] = process.argv.slice(2);
        if (!input || !out || rest.length)
            throw new Error('Usage: node profile-probe.cjs <builtin-source-dir> <new-out> [source-bound-bundle.js]');
        if (bundle) makeBundle(path.resolve(__dirname, '../../..'), input, path.resolve(bundle), out);
        else stage(input, out);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { EXCLUDED, parseData, select, stage };
