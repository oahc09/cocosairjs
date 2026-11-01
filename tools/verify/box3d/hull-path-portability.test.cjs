/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Execute the actual path consumer with explicit POSIX/Windows path semantics, never native physics.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');
const filename = path.resolve(__dirname, '../../build/box3d-hull-qualification.cjs');
const source = fs.readFileSync(filename, 'utf8');

function load(paths) {
    const compiled = new Module(filename, module);
    const originalRequire = Module.createRequire(filename);
    compiled.require = (name) => (name === 'node:path' ? paths : originalRequire(name));
    compiled._compile(source, filename);
    return compiled.exports.legacyCompilePaths;
}

for (const [platform, paths, root, origin] of [
    ['POSIX', path.posix, '/candidate', '/original'],
    ['Windows', path.win32, 'C:\\candidate', 'D:\\original'],
]) {
    const mappingFor = load(paths);
    const directory = paths.join(root, 'tools/physics/box3d/output/frozen');

    test(`${platform}: relocation preserves all 53 exact units and leaves compiler input bytes unchanged`, () => {
        const local = mappingFor({ root, directory });
        const moved = mappingFor({ root, directory, provenanceRoot: origin });
        assert.equal(local.files.length, 53);
        assert.deepEqual(local.files.map(local.normalize), moved.files.map(moved.normalize));
        const rows = moved.files.map((file) => ({ file, directory: origin }));
        const before = JSON.stringify(rows);
        moved.verifyCompile(rows);
        assert.equal(JSON.stringify(rows), before);
        const include =
            '-I' + paths.join(origin, 'tools/physics/box3d/output/frozen/hull-legacy-baseline/staged-core/include');
        assert.equal(moved.normalize(include), '-I<baseline>/staged-core/include');
        assert(moved.files.map(moved.normalize).every((name) => !name.includes('\\')));
    });

    test(`${platform}: root/path escapes, traversal, controls and noncanonical roots still reject`, () => {
        for (const provenanceRoot of [
            'relative',
            origin + paths.sep,
            origin + paths.sep + 'a' + paths.sep + '..' + paths.sep + 'b',
            origin + '\0bad',
            paths.parse(origin).root,
        ])
            assert.throws(() => mappingFor({ root, directory, provenanceRoot }));
        assert.throws(() => mappingFor({ root, directory: paths.resolve(root, '..', 'outside') }));
        const { normalize } = mappingFor({ root, directory, provenanceRoot: origin });
        for (const name of [
            paths.join(root, 'file.c'),
            paths.join(origin + '-other', 'file.c'),
            origin + paths.sep + 'a' + paths.sep + '..' + paths.sep + 'b.c',
            '-I' + paths.resolve(origin, '..', 'outside'),
            '-DNAME=bad\\value',
            '-DNAME=bad\nvalue',
        ])
            assert.throws(() => normalize(name), name);
    });

    test(`${platform}: missing, duplicate, reordered and foreign compiler units cannot match`, () => {
        const mapping = mappingFor({ root, directory, provenanceRoot: origin });
        for (const mutate of [
            (rows) => rows.pop(),
            (rows) => {
                rows[1].file = rows[0].file;
            },
            (rows) => {
                [rows[0], rows[1]] = [rows[1], rows[0]];
            },
            (rows) => {
                rows[0].directory = root;
            },
        ]) {
            const rows = mapping.files.map((file) => ({ file, directory: origin }));
            mutate(rows);
            assert.throws(() => mapping.verifyCompile(rows));
        }
    });
}
