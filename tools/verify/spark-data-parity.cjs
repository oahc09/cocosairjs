#!/usr/bin/env node
/**
 * SPK-13 CPU/WASM decode-parity collector (equivalent re-run of the port's tests/data-parity.mjs).
 *
 * It exercises the WASM and wasm-bindgen glue that THIS repository actually ships
 * (`vendor/spark-rs/spark_rs_bg.wasm` + `vendor/spark-rs/spark_rs.js`), not a copy: the bytes are
 * hashed against the audited SPK-11 identities before anything runs.
 *
 * Contract families, each comparing two isolated instances of the same preserved WASM:
 *   fixture-hash/...        every fixture's byte length + SHA-256 as recorded in the manifest
 *   header/...              .rad header decode
 *   decode/packed|extended  full-file push vs irregular chunked push must yield identical bytes
 *   sort16|sort32/...       ordering vs an independent stable unsigned-key oracle (no JS float compare)
 *   lod/...                 LoD tree build + init/share/dispose + standard & dynamic traversal
 *   raycast/...             packed and extended ray buffers
 *
 * Outputs are summarised as {type, length, sha256} per typed array plus sorted scalar fields, i.e.
 * the exact bit pattern of the buffers that later become GPU uploads. Those summaries are compared
 * against a frozen golden set; `--out` writes evidence into THIS repository only. Nothing under
 * `--fixtures` is ever written.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(`--${name}=`.length) : null;
};

// SPK-11 audited identities (docs/THIRD_PARTY_LICENSES.md §9, docs/UPSTREAM.md §Spark WASM provenance).
const WASM_SHA = '974320be5859f426967a2d9cc237e5eae1aca98b55e35087022d6d884b2dcce7';
const GLUE_SHA = 'a4b2cc7226f2e4c9bf397b56da3520e6c6f7d65b55e486783ef9bffac3b4bf72';

const wasmPath = opt('wasm') || 'vendor/spark-rs/spark_rs_bg.wasm';
const gluePath = opt('glue') || 'vendor/spark-rs/spark_rs.js';
const fixturesDir = opt('fixtures') || path.join(root, '..', 'spark-cocosairjs', 'tests', 'fixtures');
const goldensPath = opt('goldens') || path.join(fixturesDir, 'decoded-goldens.json');
const outPath = opt('out');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const abs = (p) => (path.isAbsolute(p) ? p : path.join(root, p));

function summary(x) {
    if (ArrayBuffer.isView(x)) {
        return {
            type: x.constructor.name,
            length: x.length,
            sha256: sha(new Uint8Array(x.buffer, x.byteOffset, x.byteLength)),
        };
    }
    if (Array.isArray(x)) return x.map(summary);
    if (x && typeof x === 'object') {
        return Object.fromEntries(
            Object.keys(x)
                .sort()
                .filter((k) => x[k] !== undefined)
                .map((k) => [k, summary(x[k])]),
        );
    }
    return x;
}

async function main() {
    if (!fs.existsSync(path.join(fixturesDir, 'manifest.json'))) {
        console.error(
            `BLOCKED: no fixture manifest under ${fixturesDir}. Point --fixtures=<dir> at a tree that holds the frozen decode fixtures (each verified by SHA-256 against its manifest entry); this collector never writes there.`,
        );
        process.exitCode = 3;
        return;
    }
    const wasmBytes = fs.readFileSync(abs(wasmPath));
    const glueBytes = fs.readFileSync(abs(gluePath));
    const wasmSha = sha(wasmBytes);
    const glueSha = sha(glueBytes);
    assert.equal(wasmSha, WASM_SHA, `vendored WASM identity changed: ${wasmSha}`);
    assert.equal(glueSha, GLUE_SHA, `vendored glue identity changed: ${glueSha}`);

    const manifest = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'manifest.json'), 'utf8'));
    assert.equal(
        manifest.wasmSha256,
        wasmSha,
        'fixture manifest was frozen against a different WASM than the one shipped here',
    );
    const oldGolden = fs.existsSync(abs(goldensPath)) ? JSON.parse(fs.readFileSync(abs(goldensPath), 'utf8')) : {};
    // Once this repository holds its own frozen baseline, later runs check against both it and the
    // external golden set, so the claim stops depending on the read-only port tree staying present.
    const ownGoldenPath = opt('own-goldens') || 'docs/evidence/spark/spk13-data-parity-goldens-20261012.json';
    const ownGolden = fs.existsSync(abs(ownGoldenPath))
        ? JSON.parse(fs.readFileSync(abs(ownGoldenPath), 'utf8'))
        : null;

    // The glue is ESM while this repository is CommonJS; importing the audited bytes as a data URL
    // keeps the tested module identical to the shipped file (hash asserted above) and the trailing
    // marker makes each import a distinct module instance.
    const instance = async (tag) =>
        import(
            'data:text/javascript;base64,' +
                Buffer.from(glueBytes.toString('utf8') + `\n// spark-data-parity instance ${tag}`).toString('base64')
        );
    const a = await instance('a');
    const b = await instance('b');
    a.initSync({ module: new Uint8Array(wasmBytes) });
    b.initSync({ module: new Uint8Array(wasmBytes) });

    const cases = [];
    const goldens = {};
    async function check(name, fn) {
        const start = Date.now();
        try {
            const detail = await fn();
            cases.push({ name, status: 'passed', durationMs: Date.now() - start, ...detail });
            console.log(`PASS ${name}`);
        } catch (e) {
            cases.push({ name, status: 'failed', error: String((e && e.stack) || e) });
            console.error(`FAIL ${name}: ${e}`);
        }
    }
    function record(name, result, ownOnly) {
        const value = summary(result);
        goldens[name] = value;
        if (ownOnly) {
            return {
                golden: 'own-baseline',
                note: 'the upstream harness freezes no golden for this family; it asserts through the independent ordering oracle, and this repository additionally stores the hash in its own baseline',
                value,
            };
        }
        const checked = [];
        if (oldGolden.cases && oldGolden.cases[name]) {
            assert.deepEqual(value, oldGolden.cases[name], `${name} differs from the external frozen golden`);
            checked.push('external');
        }
        if (ownGolden && ownGolden.cases && ownGolden.cases[name]) {
            assert.deepEqual(value, ownGolden.cases[name], `${name} differs from this repository's own frozen golden`);
            checked.push('in-repo');
        }
        return { golden: checked.length ? checked.join('+') : 'absent', value };
    }
    function decode(w, bytes, name, format, extended, chunked) {
        const d = extended ? w.decode_to_extsplats(format, name) : w.decode_to_packedsplats(format, name, null);
        if (chunked) {
            let o = 0;
            for (const n of [1, 2, 5, 13, 257, 65536]) {
                if (o >= bytes.length) break;
                d.push(bytes.subarray(o, Math.min(bytes.length, o + n)));
                o += n;
            }
            while (o < bytes.length) {
                d.push(bytes.subarray(o, o + 65537));
                o += 65537;
            }
        } else {
            d.push(bytes);
        }
        return d.finish();
    }

    for (const f of manifest.fixtures) {
        if (f.kind === 'remote-upstream-example' && !flag('include-remote')) {
            cases.push({
                name: `skipped/${f.name}`,
                status: 'skipped',
                reason: 'remote upstream example asset; its redistribution licence is unverified, so it is not read by default (--include-remote to opt in)',
                bytes: f.bytes,
                sha256: f.sha256,
            });
            continue;
        }
        await check(`fixture-hash/${f.name}`, async () => {
            const bytes = fs.readFileSync(path.join(fixturesDir, f.name));
            assert.equal(bytes.length, f.bytes, `${f.name} byte length drifted from the manifest`);
            assert.equal(sha(bytes), f.sha256, `${f.name} bytes drifted from the manifest`);
            return { bytes: f.bytes };
        });
        const bytes = fs.readFileSync(path.join(fixturesDir, f.name));
        if (f.headerOnly) {
            await check(`header/${f.name}`, () => {
                const x = a.decode_rad_header(bytes);
                const y = b.decode_rad_header(bytes);
                assert.deepEqual(x, y, 'two instances disagree on the header');
                assert.equal(x.meta.count, f.expectedSplats, 'header splat count');
                return { count: x.meta.count, chunks: x.meta.chunks.length, ...record(`header/${f.name}`, x) };
            });
            continue;
        }
        for (const ext of [false, true]) {
            await check(`decode/${ext ? 'extended' : 'packed'}/${f.name}`, () => {
                if (f.expectError) {
                    let ea;
                    let eb;
                    try {
                        decode(a, bytes, f.name, f.format, ext, false);
                    } catch (e) {
                        ea = String(e);
                    }
                    try {
                        decode(b, bytes, f.name, f.format, ext, true);
                    } catch (e) {
                        eb = String(e);
                    }
                    assert.ok(ea, 'invalid input must fail');
                    assert.equal(ea, eb, 'both instances must reject identically');
                    if (typeof f.expectError === 'string') assert.ok(ea.includes(f.expectError), `error text: ${ea}`);
                    return { expectedError: ea };
                }
                const outA = decode(a, bytes, f.name, f.format, ext, false);
                const outB = decode(b, bytes, f.name, f.format, ext, true);
                assert.deepEqual(summary(outA), summary(outB), 'whole-buffer vs irregular-stream decoded bytes');
                if (f.expectedSplats !== undefined) assert.equal(outA.numSplats, f.expectedSplats, 'splat count');
                if (f.expectedShDegree !== undefined) assert.equal(outA.maxShDegree, f.expectedShDegree, 'SH degree');
                if (outA.maxShDegree >= 3 && f.chunkIndex !== 0) {
                    assert.ok(outA.sh1 && outA.sh1.some((x) => x !== 0), 'sh1 must be populated');
                    assert.ok(outA.sh2 && outA.sh2.some((x) => x !== 0), 'sh2 must be populated');
                    assert.ok(
                        (ext ? outA.sh3a : outA.sh3) && (ext ? outA.sh3a : outA.sh3).some((x) => x !== 0),
                        'sh3 must be populated',
                    );
                    if (ext)
                        assert.ok(
                            outA.sh3b.some((x) => x !== 0),
                            'sh3b must be populated',
                        );
                }
                return {
                    numSplats: outA.numSplats,
                    maxShDegree: outA.maxShDegree,
                    exactBytes: true,
                    ...record(`${ext ? 'extended' : 'packed'}/${f.name}`, outA),
                };
            });
        }
    }

    // Independent ordering oracle: finite nonnegative raw depth keys only, descending key,
    // original index order for ties. No JS floating-point comparison is involved.
    const edge32 = [
        0, 1, 0x007fffff, 0x00800000, 0x3f800000, 0x3f800000, 0x40000000, 0x7f7fffff, 0x7f800000, 0x7fc00000,
        0xffffffff, 0x80000000, 0xff800000, 0x3f800000, 0x00000000,
    ];
    const edge16 = [
        0, 1, 0x03ff, 0x0400, 0x3c00, 0x3c00, 0x4000, 0x7bff, 0x7c00, 0x7e00, 0xffff, 0x8000, 0xfc00, 0x3c00, 0,
    ];
    for (const bits of [16, 32]) {
        for (const variant of ['edges', 'empty', 'one', 'ties', 'random']) {
            await check(`sort${bits}/${variant}`, () => {
                const edges = bits === 32 ? edge32 : edge16;
                let state = 0x12345678;
                const next = () => {
                    state ^= state << 13;
                    state ^= state >>> 17;
                    state ^= state << 5;
                    return state >>> 0;
                };
                const input =
                    variant === 'edges'
                        ? edges
                        : variant === 'empty'
                          ? []
                          : variant === 'one'
                            ? [edges[4]]
                            : variant === 'ties'
                              ? Array(4097).fill(edges[4])
                              : Array.from({ length: 70001 }, (_, i) =>
                                    i % 4 === 0
                                        ? edges[i % edges.length]
                                        : next() & (bits === 32 ? 0xffffffff : 0xffff),
                                );
                const keys = bits === 32 ? Uint32Array.from(input) : Uint16Array.from(input);
                const limit = bits === 32 ? 0x7f800000 : 0x7c00;
                const expected = Array.from(keys, (key, index) => ({ key, index }))
                    .filter((x) => x.key < limit)
                    .sort((x, y) => y.key - x.key || x.index - y.index)
                    .map((x) => x.index);
                const results = [];
                for (const w of [a, b]) {
                    const ordering = new Uint32Array(keys.length + 13).fill(0xdeadbeef);
                    const count = (bits === 32 ? w.sort32_splats : w.sort_splats)(keys.length, keys, ordering);
                    assert.equal(count, expected.length, 'active count');
                    assert.deepEqual(Array.from(ordering.subarray(0, count)), expected, 'ordering vs oracle');
                    assert.equal(ordering[count], 0xdeadbeef, 'must not write past the active prefix');
                    results.push(ordering.subarray(0, count));
                }
                assert.deepEqual(results[0], results[1], 'instances disagree');
                return {
                    inputCount: keys.length,
                    activeCount: expected.length,
                    orderingHash: summary(results[0]).sha256,
                    oracle: 'independent JS stable unsigned-key oracle',
                    ...record(`sort${bits}/${variant}`, results[0], true),
                };
            });
        }
    }

    const sourceBytes = fs.readFileSync(path.join(fixturesDir, 'synthetic-sh3.ply'));
    for (const ext of [false, true]) {
        for (const quality of [false, true]) {
            await check(`lod/${ext ? 'extended' : 'packed'}/${quality ? 'quality' : 'tiny'}`, () => {
                const outputs = [];
                for (const w of [a, b]) {
                    const x = decode(w, sourceBytes, 'synthetic-sh3.ply', 'ply', ext, false);
                    const extra = Object.fromEntries(Object.entries(x).filter(([k]) => k.startsWith('sh')));
                    const lod = ext
                        ? quality
                            ? w.bhatt_lod_extsplats(x.numSplats, x.ext0, x.ext1, extra, 1.75, undefined)
                            : w.tiny_lod_extsplats(x.numSplats, x.ext0, x.ext1, extra, 1.5, false, undefined)
                        : quality
                          ? w.bhatt_lod_packedsplats(x.numSplats, x.packed, extra, 1.75, undefined, x.splatEncoding)
                          : w.tiny_lod_packedsplats(
                                x.numSplats,
                                x.packed,
                                extra,
                                1.5,
                                false,
                                undefined,
                                x.splatEncoding,
                            );
                    assert.ok(lod.lodTree && lod.lodTree.length, 'real LoD tree must be produced');
                    assert.ok(lod.numSplats > 0, 'LoD must keep splats');
                    const { lodId } = w.init_lod_tree(lod.numSplats, lod.lodTree);
                    const level = w.get_lod_tree_level(lodId, 0);
                    const shared = w.new_shared_lod_tree(lodId);
                    assert.ok(shared.lodId !== lodId, 'sharing must hand out a distinct id');
                    w.dispose_lod_tree(shared.lodId);
                    const traversals = {};
                    for (const [mode, fn] of [
                        ['standard', w.traverse_lod_trees],
                        ['dynamic', w.dynamic_traverse_lod_trees],
                    ]) {
                        traversals[mode] = fn(
                            12,
                            0.01,
                            undefined,
                            new Uint32Array([lodId]),
                            new Uint32Array([0]),
                            new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
                            new Float32Array([1]),
                            new Float32Array([1]),
                            new Float32Array([1]),
                            new Float32Array([0]),
                            new Float32Array([0]),
                        );
                    }
                    w.dispose_lod_tree(lodId);
                    outputs.push({ lod, level, traversals });
                }
                assert.deepEqual(summary(outputs[0]), summary(outputs[1]), 'instances disagree on LoD');
                return {
                    numSplats: outputs[0].lod.numSplats,
                    treeHash: summary(outputs[0].lod.lodTree).sha256,
                    exactBytes: true,
                    ...record(`lod/${ext ? 'extended' : 'packed'}/${quality ? 'quality' : 'tiny'}`, outputs[0]),
                };
            });
        }
    }

    for (const ext of [false, true]) {
        await check(`raycast/${ext ? 'extended' : 'packed'}`, () => {
            const outputs = [];
            for (const w of [a, b]) {
                const x = decode(w, sourceBytes, 'synthetic-sh3.ply', 'ply', ext, false);
                const hits = [];
                for (const origin of [
                    [0, 0, 0],
                    [0, 0, -5],
                    [-1, 0, 0],
                ]) {
                    for (const direction of [
                        [0, 0, -1],
                        [0, 0, 1],
                    ]) {
                        w.get_raycast_buffer().set(ext ? x.ext0 : x.packed);
                        if (ext) w.get_raycast_buffer2().set(x.ext1);
                        const r = ext
                            ? w.raycast_ext_buffers(...origin, ...direction, 0, 0, 100, x.numSplats)
                            : w.raycast_packed_buffer(...origin, ...direction, 0, 0, 100, x.numSplats, -12, 9, false);
                        hits.push(Array.from(r));
                    }
                }
                outputs.push(hits);
            }
            assert.deepEqual(outputs[0], outputs[1], 'instances disagree on raycast');
            return {
                rays: 6,
                hits: outputs[0].reduce((n, x) => n + x.length, 0),
                ...record(`raycast/${ext ? 'extended' : 'packed'}`, outputs[0]),
            };
        });
    }

    const counts = Object.fromEntries(
        ['passed', 'failed', 'skipped'].map((status) => [status, cases.filter((x) => x.status === status).length]),
    );
    const goldenHits = cases.filter((c) => /external|in-repo/.test(c.golden || '')).length;
    const ownBaselineNames = cases.filter((c) => c.golden === 'own-baseline').map((c) => c.name);
    const goldenMisses = cases.filter((c) => c.golden === 'absent').map((c) => c.name);
    const report = {
        schemaVersion: 'spark-data-parity/1',
        task: 'SPK-13',
        scope: 'CPU/WASM decode contract only: no browser worker, GPU/render, HTTP loader, or XR claim. The JS-side half-float / packed-splat pattern suite of the port harness compares two built Spark packages and is covered here by bundle gates instead (see notClaimed).',
        collectedAt: new Date().toISOString(),
        identity: {
            repositoryHead: (() => {
                try {
                    return require('node:child_process')
                        .execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
                        .trim();
                } catch {
                    return null;
                }
            })(),
            wasm: { path: abs(wasmPath), bytes: wasmBytes.length, sha256: wasmSha },
            glue: { path: abs(gluePath), bytes: glueBytes.length, sha256: glueSha },
            fixtureManifest: {
                path: path.join(fixturesDir, 'manifest.json'),
                sha256: sha(fs.readFileSync(path.join(fixturesDir, 'manifest.json'))),
                sourceCommit: manifest.sourceCommit,
            },
            goldens: {
                path: abs(goldensPath),
                sha256: fs.existsSync(abs(goldensPath)) ? sha(fs.readFileSync(abs(goldensPath))) : null,
                cases: Object.keys((oldGolden && oldGolden.cases) || {}).length,
            },
            ownGoldens: {
                path: abs(ownGoldenPath),
                exists: !!ownGolden,
                sha256: ownGolden ? sha(fs.readFileSync(abs(ownGoldenPath))) : null,
                cases: ownGolden ? Object.keys(ownGolden.cases || {}).length : 0,
            },
            simd: a.simd_enabled(),
        },
        comparison:
            'Two isolated module instances of the same preserved WASM; whole-buffer vs irregular chunked decode must agree exactly, sorting additionally uses an independent stable-key oracle, and every recorded output is compared against the frozen golden summaries.',
        notClaimed: [
            'The three remote upstream example assets (butterfly.spz, furry-logo-pedestal.spz, sutro.zip) are skipped: their manifest entry records the repository code as MIT but the asset-specific redistribution licence as unverified, so this collector does not read them unless --include-remote is passed explicitly.',
            "The port harness's final family (importing two built Spark packages and comparing fromHalf/toHalf over all 65536 half patterns plus setPackedSplat/unpackSplat/encodeExtSplat over 256 boundary vectors) compares two distributable JS builds and is not reproduced here. In this repository the equivalent guarantee is by construction and is gated elsewhere: the Spark body is the byte-identical frozen vendor/spark tree (vendor-spark-tree.cjs --check), the runtime subgraph is regenerated from it (spark-runtime-tree.cjs --check), and the JS half-float path is exercised end to end by the 132-row pixel-parity evidence, which would move if the encoding differed.",
            'CPU/WASM decode only: no GPU upload, browser worker, HTTP loader, or XR claim in this file.',
        ],
        counts: {
            ...counts,
            goldenMatch: goldenHits,
            goldenOwnBaseline: ownBaselineNames.length,
            goldenAbsent: goldenMisses.length,
        },
        cases,
        goldens,
    };
    console.log(
        JSON.stringify({
            ...counts,
            goldenMatch: goldenHits,
            goldenOwnBaseline: ownBaselineNames.length,
            goldenAbsent: goldenMisses.length,
        }),
    );
    if (opt('write-own-goldens')) {
        const target = abs(opt('write-own-goldens'));
        assert.notEqual(
            path.resolve(target),
            path.resolve(abs(goldensPath)),
            'refusing to overwrite the external golden set',
        );
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(
            target,
            JSON.stringify(
                {
                    schemaVersion: 'spark-data-parity-goldens/1',
                    task: 'SPK-13',
                    collectedAt: new Date().toISOString(),
                    wasmSha256: wasmSha,
                    glueSha256: glueSha,
                    origin: "Frozen decode summaries produced by THIS repository's vendor/spark-rs WASM and glue. Writing this file is a baseline generation step, not by itself evidence of rendering parity.",
                    cases: goldens,
                },
                null,
                2,
            ) + '\n',
        );
        console.log(`own-goldens=${target} cases=${Object.keys(goldens).length}`);
    }
    if (outPath) {
        fs.mkdirSync(path.dirname(abs(outPath)), { recursive: true });
        fs.writeFileSync(abs(outPath), JSON.stringify(report, null, 2) + '\n');
        console.log(`report=${abs(outPath)} bytes=${fs.statSync(abs(outPath)).size}`);
    }
    if (counts.failed) process.exitCode = 1;
}

main().catch((e) => {
    console.error(String((e && e.stack) || e));
    process.exitCode = 2;
});
