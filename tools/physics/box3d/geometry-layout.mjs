// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, sha256 } from './verify-sources.mjs';
import { verifyStagedCore } from './patch-intake.mjs';
const [oldCore, newCore, out] = process.argv.slice(2).map((p) => resolve(p));
assert.ok(!existsSync(out));
mkdirSync(out, { recursive: true });
const report = { status: 'RUNNING', startedAt: new Date().toISOString(), commands: [], layouts: {}, inputs: [] };
const raw = resolve(out, 'geometry-layout.raw.json');
const persist = () => writeFileSync(raw, JSON.stringify(report, null, 2) + '\n');
function run(command, args) {
    const r = spawnSync(command, args, { cwd: root, encoding: 'utf8' }),
        index = report.commands.length + 1;
    writeFileSync(resolve(out, `command-${index}.stdout.txt`), r.stdout ?? '');
    writeFileSync(resolve(out, `command-${index}.stderr.txt`), r.stderr ?? '');
    report.commands.push({
        command,
        args: args.map((a) => a.replaceAll(root, '<repo>')),
        exitCode: r.status,
        error: r.error?.message ?? null,
    });
    persist();
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
}
try {
    const before = JSON.parse(readFileSync(oldCore + '.receipt.json'));
    assert.equal(before.patchChainSha256, '20dd450a4313774e1d934df9fa9ec3458df35d9ee314beffa9d846404cdb86bf');
    for (const f of before.files) {
        const b = readFileSync(resolve(oldCore, f.path));
        assert.equal(sha256(b), f.sha256);
        assert.equal(b.length, f.bytes);
    }
    const after = verifyStagedCore(newCore);
    report.identities = { old: before.patchChainSha256, new: after.patchChainSha256 };
    const source = 'tools/physics/box3d/native/geometry_layout_probe.c';
    report.inputs.push({ path: source, sha256: sha256(readFileSync(resolve(root, source))) });
    for (const [name, core, extra] of [
        ['old', oldCore, []],
        ['new', newCore, ['-DAIR_GEOMETRY_EXTENSION']],
    ]) {
        const flags = ['-std=gnu17', '-DBOX3D_DISABLE_AVX2', '-I' + core + '/include', '-I' + core + '/src', ...extra];
        const exe = resolve(out, `${name}-native`);
        run('gcc', [...flags, source, '-o', exe]);
        report.layouts[name + 'Native'] = JSON.parse(run(exe, []));
        const js = resolve(out, `${name}-wasm.cjs`);
        run('emcc', [
            ...flags,
            '-msimd128',
            '-msse2',
            source,
            '-sENVIRONMENT=node',
            '-sSINGLE_FILE=1',
            '-sEXIT_RUNTIME=1',
            '-o',
            js,
        ]);
        report.layouts[name + 'Wasm'] = JSON.parse(run(process.execPath, [js]));
    }
    for (const mode of ['Native', 'Wasm']) {
        const a = report.layouts['old' + mode],
            b = report.layouts['new' + mode];
        assert.ok(b.contactBytes > a.contactBytes);
        for (const field of [
            'pointerBytes',
            'manifoldBytes',
            'manifoldPointBytes',
            'contactGenerationOffset',
            'contactManifoldsOffset',
        ])
            assert.equal(a[field], b[field]);
    }
    assert.equal(report.layouts.oldWasm.pointerBytes, 4);
    assert.equal(report.layouts.newWasm.pointerBytes, 4);
    report.artifacts = ['old-native', 'new-native', 'old-wasm.cjs', 'new-wasm.cjs'].map((path) => ({
        path,
        sha256: sha256(readFileSync(resolve(out, path))),
    }));
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.error = error.stack;
    process.exitCode = 1;
} finally {
    report.completedAt = new Date().toISOString();
    persist();
    console.log(JSON.stringify({ status: report.status, layouts: report.layouts, error: report.error }));
}
