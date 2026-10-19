'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const index = require('../gen-index.cjs');

function fixture(callback) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-index-test-'));
    function write(relative, text) {
        const filename = path.join(root, relative);
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        fs.writeFileSync(filename, text);
    }
    function skill(name, body = '', overrideName = name) {
        write(
            `${name}/SKILL.md`,
            `---\nname: ${overrideName}\ndescription: "Synthetic ${name}"\n---\n\n# ${name}\n\n${body}`,
        );
    }
    try {
        return callback({ root, write, skill });
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

test('shared projection has fixed fields, legacy empties and strict field types', () => {
    assert.deepEqual(index.projectRoutingRecord({ name: 'demo', description: 'text' }), {
        name: 'demo',
        description: 'text',
        owns: [],
        when_to_use: [],
        not_for: [],
        metadata: { description_zh: '' },
    });
    const data = {
        name: 'demo',
        description: 'text',
        owns: ['light'],
        when_to_use: ['no shadows'],
        not_for: ['types -> other'],
        metadata: { description_zh: '光影' },
        body: 'not indexed',
    };
    const projected = index.projectRoutingRecord(data);
    assert.equal(projected.metadata.description_zh, '光影');
    assert.equal(Object.hasOwn(projected, 'body'), false);
    assert.notEqual(projected.owns, data.owns);
    assert.throws(() => index.projectRoutingRecord({ name: 'demo', description: 7 }), /strings/);
    assert.throws(
        () => index.projectRoutingRecord({ name: 'demo', description: 'text', owns: 'light' }),
        /string array/,
    );
    assert.throws(
        () => index.projectRoutingRecord({ name: 'demo', description: 'text', metadata: { description_zh: 7 } }),
        /string/,
    );
});

test('serialization pins independent field views and never adds body fields', () => {
    const record = index.projectRoutingRecord({
        name: 'demo',
        description: 'text',
        owns: ['one', 'two'],
        metadata: { description_zh: '光' },
    });
    assert.equal(index.serializeRoutingRecord(record, 'host-minimal'), 'name: demo\ndescription: text\n');
    assert.equal(
        index.serializeRoutingRecord(record, 'suite-extended'),
        'name: demo\ndescription: text\nowns: one; two\nwhen_to_use: \nnot_for: \nmetadata.description_zh: 光\n',
    );
    assert.throws(() => index.serializeRoutingRecord(record, 'body'), /unknown routing view/);
});

test('generated schema has all routing fields, unique sorted names and deterministic bytes', () =>
    fixture(({ root, skill }) => {
        skill('cocosair-zeta');
        skill('cocosair-alpha');
        const records = index.loadRoutingRecords(root);
        assert.deepEqual(
            records.map((record) => record.name),
            ['cocosair-alpha', 'cocosair-zeta'],
        );
        const generated = index.generateIndex(root);
        assert.equal(generated.schema, 2);
        assert.equal(generated.min_compatible_schema, 2);
        assert.deepEqual(
            generated.skills.map((record) => record.name),
            ['cocosair-alpha', 'cocosair-zeta'],
        );
        assert.equal(new Set(generated.skills.map((record) => record.name)).size, 2);
        for (const record of generated.skills) {
            assert.deepEqual(Object.keys(record), [
                'name',
                'layer',
                'family',
                'path',
                'description',
                'owns',
                'when_to_use',
                'not_for',
                'metadata',
                'refs',
            ]);
            assert.deepEqual(
                index.projectRoutingRecord(record),
                records.find((entry) => entry.name === record.name),
            );
        }
        assert.equal(JSON.stringify(index.generateIndex(root)), JSON.stringify(generated));
        assert.equal(JSON.stringify(generated).includes(root), false);
        assert.equal(JSON.stringify(generated).includes('generated_at'), false);
    }));

test('reference target and answer extraction preserves nested and escaped paths', () =>
    fixture(({ root, skill }) => {
        skill(
            'cocosair-alpha',
            '## Reference map\n\n- [Nested](references/a(b).md) - explains matrices\n- [Escaped](references/a\\(b\\).md) - explains paths\n- [Angle](<references/a b.md>) - explains whitespace\n',
        );
        assert.deepEqual(index.generateIndex(root).skills[0].refs, [
            { file: 'references/a(b).md', answers: 'explains matrices' },
            { file: 'references/a(b).md', answers: 'explains paths' },
            { file: 'references/a b.md', answers: 'explains whitespace' },
        ]);
    }));

test('new Reference map takes precedence over legacy References', () =>
    fixture(({ root, skill }) => {
        skill(
            'cocosair-alpha',
            '## References\n\n- [Old](references/old.md) - legacy\n\n## Reference map\n\n- [New](references/new.md) - current\n',
        );
        assert.deepEqual(index.generateIndex(root).skills[0].refs, [{ file: 'references/new.md', answers: 'current' }]);
    }));

test('directory identity mismatches and duplicate projected names are rejected', () =>
    fixture(({ root, skill }) => {
        skill('cocosair-alpha');
        skill('cocosair-beta', '', 'cocosair-alpha');
        assert.throws(() => index.loadRoutingRecords(root), /name|identity|directory|duplicate/i);
        assert.throws(() => index.generateIndex(root), /name|identity|directory|duplicate/i);
    }));

test('reference map link titles do not contaminate answer text', () =>
    fixture(({ root, skill }) => {
        skill('cocosair-alpha', '## Reference map\n\n- [Guide](references/guide.md "Read guide") - exact answer\n');
        assert.deepEqual(index.generateIndex(root).skills[0].refs, [
            { file: 'references/guide.md', answers: 'exact answer' },
        ]);
    }));

test('closure includes sibling directories, reference definitions and cycles without writes', () =>
    fixture(({ root, skill, write }) => {
        // The source checker is stubbed only to isolate closure collection; no source/runtime code is executed.
        write('cocosair/scripts/check-paths.cjs', "throw new Error('Analyzed code must never execute');\n");
        skill('cocosair-alpha', '[next][b]\n\n[b]: ../cocosair-beta/SKILL.md\n');
        skill('cocosair-beta', '[back](../cocosair-alpha/SKILL.md)\n');
        write('cocosair-beta/references/detail.md', '# Included with sibling\n');
        const report = index.analyzeBundle(root, 'cocosair-alpha', { inspect: () => ({ status: 'PASS' }) });
        assert.equal(report.status, 'PASS');
        assert.deepEqual(report.closure_skills, ['cocosair-alpha', 'cocosair-beta']);
        assert.ok(report.closure_files.includes('cocosair-beta/references/detail.md'));
        assert.equal(new Set(report.closure_files).size, report.closure_files.length);
        assert.deepEqual(index.analyzeBundle(root, 'cocosair-alpha', { inspect: () => ({ status: 'PASS' }) }), report);
    }));

test('closure rejects out-of-tree targets and never follows symbolic links', () =>
    fixture(({ root, skill, write }) => {
        write('cocosair/scripts/check-paths.cjs', "throw new Error('Analyzed code must never execute');\n");
        skill('cocosair-alpha', '[escape](../../outside.md)\n');
        const report = index.analyzeBundle(root, 'cocosair-alpha', { inspect: () => ({ status: 'PASS' }) });
        assert.equal(report.status, 'FAIL');
        assert.deepEqual(report.failures, [{ file: 'cocosair-alpha/SKILL.md', target: '../outside.md' }]);
        fs.symlinkSync('/tmp', path.join(root, 'cocosair-alpha', 'escape'));
        assert.throws(
            () => index.analyzeBundle(root, 'cocosair-alpha', { inspect: () => ({ status: 'PASS' }) }),
            /symlink/,
        );
    }));

test('navigation FAIL retains actual closed-tree statistics and cannot be bypassed', () =>
    fixture(({ root, skill, write }) => {
        write('cocosair/scripts/check-paths.cjs', "throw new Error('Analyzed code must never execute');\n");
        skill('cocosair-alpha', '[next](../cocosair-beta/SKILL.md)\n');
        skill('cocosair-beta', '# Beta\n');
        let calls = 0;
        const report = index.analyzeBundle(root, 'cocosair-alpha', {
            inspect: (_root, fileSystem) => {
                calls++;
                if (fileSystem) {
                    assert.equal(fileSystem.existsSync(path.join(root, 'cocosair-alpha/SKILL.md')), true);
                    assert.equal(fileSystem.existsSync(path.join(root, 'cocosair/scripts/check-paths.cjs')), false);
                    assert.throws(
                        () => fileSystem.readFileSync(path.join(root, 'cocosair/scripts/check-paths.cjs')),
                        /outside/,
                    );
                }
                return { status: 'FAIL', failures: [{ reason: 'navigation authority failure' }] };
            },
        });
        assert.equal(calls, 2);
        assert.equal(report.status, 'FAIL');
        assert.deepEqual(report.closure_skills, ['cocosair-alpha', 'cocosair-beta']);
        assert.ok(report.closure_bytes > 0);
        assert.ok(report.all_bytes >= report.closure_bytes);
        assert.equal(report.snapshot_hash.length, 64);
    }));

test('encoded escapes, invalid encoding, absolute paths and backslashes fail containment', () =>
    fixture(({ root, skill, write }) => {
        write('cocosair/scripts/check-paths.cjs', "throw new Error('Analyzed code must never execute');\n");
        skill(
            'cocosair-alpha',
            '[encoded](%2e%2e/%2e%2e/out.md)\n[bad](bad%ZZ.md)\n[absolute](/tmp/out.md)\n[windows](C:/out.md)\n[backslash](..%5cout.md)\n',
        );
        const report = index.analyzeBundle(root, 'cocosair-alpha', { inspect: () => ({ status: 'PASS' }) });
        assert.equal(report.status, 'FAIL');
        assert.equal(report.failures.length, 5);
        assert.deepEqual(report.closure_skills, ['cocosair-alpha']);
    }));

test('CLI writes only the two deterministic indexes, checks drift, and refuses bundle or implicit writes', () =>
    fixture(({ root, skill, write }) => {
        const { spawnSync } = require('node:child_process');
        const parser = require('../lib/md-parse.cjs');
        skill('cocosair-alpha');
        write('cocosair-alpha/references/kept.md', '# Keep every source byte\n');
        const before = parser.inventory(root);
        const script = path.resolve(__dirname, '../gen-index.cjs');
        const run = (...args) => spawnSync(process.execPath, [script, '--root', root, ...args], { encoding: 'utf8' });
        const missing = run('--check');
        assert.equal(missing.status, 1);
        assert.deepEqual(parser.inventory(root), before);
        const created = run('--write');
        assert.equal(created.status, 0, created.stdout + created.stderr);
        const first = parser.inventory(root);
        assert.deepEqual(
            first.filter((file) => !['skills/index.json', 'skills/INDEX.md'].includes(file.path)),
            before,
        );
        assert.equal(run('--check').status, 0);
        assert.equal(run('--write').status, 0);
        assert.deepEqual(parser.inventory(root), first);
        write('INDEX.md', 'stale\n');
        const drift = run('--check');
        assert.equal(drift.status, 1);
        assert.deepEqual(JSON.parse(drift.stdout).differences, ['INDEX.md']);
        assert.equal(fs.readFileSync(path.join(root, 'INDEX.md'), 'utf8'), 'stale\n');
        for (const flags of [['--bundle', 'cocosair-alpha'], ['--write', '--check'], ['--write=false'], ['--root']]) {
            assert.equal(run(...flags).status, 1, flags.join(' '));
        }
    }));

test('CLI analysis executes the tool-owned checker and never an analyzed-tree checker', () =>
    fixture(({ root, skill, write }) => {
        const { spawnSync } = require('node:child_process');
        skill('cocosair-alpha');
        write('cocosair/scripts/check-paths.cjs', "throw new Error('Analyzed code must never execute');\n");
        const trusted = fs.mkdtempSync(path.join(os.tmpdir(), 'trusted-skills-tools-'));
        try {
            fs.mkdirSync(path.join(trusted, 'tools/skills/lib'), { recursive: true });
            fs.mkdirSync(path.join(trusted, 'skills/cocosair/scripts'), { recursive: true });
            fs.copyFileSync(
                path.resolve(__dirname, '../gen-index.cjs'),
                path.join(trusted, 'tools/skills/gen-index.cjs'),
            );
            fs.copyFileSync(
                path.resolve(__dirname, '../lib/md-parse.cjs'),
                path.join(trusted, 'tools/skills/lib/md-parse.cjs'),
            );
            fs.writeFileSync(
                path.join(trusted, 'skills/cocosair/scripts/check-paths.cjs'),
                "module.exports = { inspect: () => ({ status: 'PASS', authority: 'tool-owned' }) };\n",
            );
            const result = spawnSync(
                process.execPath,
                [
                    path.join(trusted, 'tools/skills/gen-index.cjs'),
                    '--root',
                    root,
                    '--analyze-bundle',
                    'cocosair-alpha',
                ],
                {
                    encoding: 'utf8',
                    env: {
                        ...process.env,
                        NODE_PATH: [
                            path.dirname(path.dirname(require.resolve('js-yaml/package.json'))),
                            process.env.NODE_PATH,
                        ]
                            .filter(Boolean)
                            .join(path.delimiter),
                    },
                },
            );
            assert.equal(result.status, 0, result.stdout + result.stderr);
            const report = JSON.parse(result.stdout);
            assert.equal(report.inspection.authority, 'tool-owned');
            assert.equal(report.closure_inspection.authority, 'tool-owned');
            assert.deepEqual(report.closure_skills, ['cocosair-alpha']);
        } finally {
            fs.rmSync(trusted, { recursive: true, force: true });
        }
    }));
