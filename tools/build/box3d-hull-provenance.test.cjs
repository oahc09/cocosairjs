/* Synthetic path-mapping rejection controls only, not native qualification evidence. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { legacyCompilePaths } = require('./box3d-hull-qualification.cjs');
const root = '/candidate',
    directory = '/candidate/tools/physics/box3d/output/frozen';
const origin = '/original';
test('same-root default and explicit relocation preserve the exact 53 logical units', () => {
    const local = legacyCompilePaths({ root, directory });
    const moved = legacyCompilePaths({ root, directory, provenanceRoot: origin });
    assert.equal(local.files.length, 53);
    assert.deepEqual(local.files.map(local.normalize), moved.files.map(moved.normalize));
    assert.equal(new Set(moved.files).size, 53);
    moved.verifyCompile(moved.files.map((file) => ({ file, directory: origin })));
    assert.throws(() => moved.verifyCompile(moved.files.map((file) => ({ file, directory: root }))));
    assert.equal(
        moved.normalize('-I/original/tools/physics/box3d/output/frozen/hull-legacy-baseline/staged-core/include'),
        '-I<baseline>/staged-core/include',
    );
});
test('noncanonical or relative roots and candidate directory escape are rejected', () => {
    for (const provenanceRoot of ['relative', '/original/../foreign', '/original/', '/original\0bad'])
        assert.throws(() => legacyCompilePaths({ root, directory, provenanceRoot }));
    assert.throws(() => legacyCompilePaths({ root, directory: '/outside', provenanceRoot: origin }));
});
test('compiler path escape, mixed roots, misleading prefixes and traversal are rejected', () => {
    const { normalize } = legacyCompilePaths({
        root,
        directory,
        provenanceRoot: origin,
    });
    for (const name of [
        '/candidate/file.c',
        '/original-other/file.c',
        '/outside/file.c',
        '/original/a/../b.c',
        '-I/outside/include',
    ])
        assert.throws(() => normalize(name));
});
test('duplicate, unknown and mixed-root units cannot match the exact inventory', () => {
    const { files, verifyCompile } = legacyCompilePaths({
        root,
        directory,
        provenanceRoot: origin,
    });
    for (const change of [
        (a) => {
            a[1] = a[0];
        },
        (a) => {
            a[0] = '/original/unknown.c';
        },
        (a) => {
            a[0] = a[0].replace('/original/', '/candidate/');
        },
        (a) => a.pop(),
    ]) {
        const changed = [...files];
        change(changed);
        assert.throws(() => verifyCompile(changed.map((file) => ({ file, directory: origin }))));
    }
});
test('command path tampering remains distinct after normalization and leaves input bytes unchanged', () => {
    const mapping = legacyCompilePaths({
        root,
        directory,
        provenanceRoot: origin,
    });
    const args = [
        '-c',
        mapping.files[0],
        '-o',
        '/original/tools/physics/box3d/output/frozen/hull-legacy-baseline/aabb.c.o',
    ];
    const before = JSON.stringify(args);
    const normal = args.map(mapping.normalize);
    const altered = [...args];
    altered[1] = mapping.files[1];
    assert.notDeepEqual(altered.map(mapping.normalize), normal);
    assert.equal(JSON.stringify(args), before);
});

// Integration controls read retained inputs only; tampering is injected in memory, never written.
const fs = require('node:fs');
const path = require('node:path');
const { verifySTBuild } = require('./box3d-assets.cjs');
const candidateRoot = path.resolve(__dirname, '../..');
const retainedDirectory = path.join(candidateRoot, 'tools/physics/box3d/output/static-mesh-wasm-release-20261024-d');
const retainedRoot = '/workspace/scratch/62d43a81bbde/box3d-recovery-after-2249-20261022/worktree-current';
test('retained native gate accepts only explicit relocation and rejects byte/hash tampering', async () => {
    const options = { provenanceRoot: retainedRoot };
    const accepted = await verifySTBuild(retainedDirectory, options);
    assert.equal(
        accepted.descriptor.manifestSha256,
        '8b40312d61c55d6701c941453dd4d45c20e369f209f971f0634222b4d7f3397c',
    );
    await assert.rejects(verifySTBuild(retainedDirectory), /Exact legacy compile inventory/);
    await assert.rejects(
        verifySTBuild(retainedDirectory, {
            provenanceRoot: retainedRoot + '-other',
        }),
        /Exact legacy compile inventory/,
    );
    const compileName = 'hull-legacy-baseline/compile_commands.json';
    const mutations = [
        [
            compileName,
            (rows) => {
                rows[0].arguments[1] = '-std=gnu99';
            },
            /Size mismatch|Hash mismatch/,
        ],
        [
            compileName,
            (rows) => {
                rows[0].file += '-other';
            },
            /Size mismatch|Hash mismatch/,
        ],
        [
            compileName,
            (rows) => {
                rows.pop();
            },
            /Size mismatch|Hash mismatch/,
        ],
        [
            compileName,
            (rows) => {
                rows.push(rows[0]);
            },
            /Size mismatch|Hash mismatch/,
        ],
        [
            compileName,
            (rows) => {
                [rows[0], rows[1]] = [rows[1], rows[0]];
            },
            /Size mismatch|Hash mismatch/,
        ],
        [
            'artifact-audit.raw.json',
            (audit) => {
                audit.compiledSourceHashes[0].sha256 = '0'.repeat(64);
            },
            /Compiled input drift/,
        ],
    ];
    for (const [name, mutate, expected] of mutations) {
        const target = path.join(retainedDirectory, name);
        const originalRead = fs.readFileSync;
        const before = originalRead(target);
        const altered = JSON.parse(before);
        mutate(altered);
        const bytes = Buffer.from(JSON.stringify(altered, null, 2) + '\n');
        fs.readFileSync = function (file, ...args) {
            return typeof file === 'string' && path.resolve(file) === target
                ? bytes
                : originalRead.call(this, file, ...args);
        };
        try {
            await assert.rejects(verifySTBuild(retainedDirectory, options), expected);
        } finally {
            fs.readFileSync = originalRead;
        }
        assert(originalRead(target).equals(before), 'Retained evidence must remain immutable');
    }
});
