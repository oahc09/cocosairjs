'use strict';

// Recovery tests reconstructed from the retained 35-test gate suite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');
const { verifyMeta, codePoints } = require('../verify-meta.cjs');
const { enumerateFiles, manifestHash } = require('../verify-lossless.cjs');

function metadata(name, overrides = {}) {
    return {
        name,
        description: 'Inspect alpha contracts and diagnose missing runtime behavior.',
        license: 'MIT',
        compatibility: 'Cocos AIR source checkout; Node.js >=18.',
        'allowed-tools': name === 'cocosair-beta' ? 'Read Bash' : 'Read Edit Write Bash',
        when_to_use: ['missing runtime behavior'],
        owns: ['alpha', 'runtime', 'contracts'],
        not_for: [],
        layer: 'subsystem',
        metadata: {
            author: 'test@example.com',
            version: '1.0.0',
            'last-updated': '2026-10-13',
            description_zh: '检查契约。',
        },
        ...overrides,
    };
}
function markdown(data, body = '# Contract\n\nOnly use authorized workspaces.\n') {
    return `---\n${yaml.dump(data, { lineWidth: -1, noRefs: true })}---\n${body}`;
}
function fixture(t) {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-meta-'));
    t.after(() => fs.rmSync(base, { recursive: true, force: true }));
    const root = path.join(base, 'candidate');
    const snapshot = path.join(base, 'snapshot');
    for (const name of ['cocosair-alpha', 'cocosair-beta']) {
        fs.mkdirSync(path.join(root, 'skills', name), { recursive: true });
        fs.writeFileSync(path.join(root, 'skills', name, 'SKILL.md'), markdown(metadata(name)));
    }
    fs.cpSync(root, snapshot, { recursive: true });
    const files = enumerateFiles(snapshot);
    fs.writeFileSync(
        path.join(snapshot, 'manifest.json'),
        JSON.stringify({ schema: 1, base_commit: 'a'.repeat(40), files, snapshot_hash: manifestHash(files) }),
    );
    const write = (name, data, body) =>
        fs.writeFileSync(path.join(root, 'skills', name, 'SKILL.md'), markdown(data, body));
    const run = (options = {}) => verifyMeta({ root, snapshot, metadataOnly: true, ...options });
    return { base, root, snapshot, write, run };
}
function problems(report) {
    return report.issues.map((issue) => `${issue.field || ''}: ${issue.problem}`).join('\n');
}

test('actual YAML parser accepts block values; Unicode budgets count code points', (t) => {
    const f = fixture(t);
    assert.equal(codePoints('a😀中'), 3);
    const file = path.join(f.root, 'skills/cocosair-alpha/SKILL.md');
    const literal = (value) =>
        fs.writeFileSync(
            file,
            markdown(metadata('cocosair-alpha')).replace(/^description:.*$/m, `description: '${value}'`),
        );
    literal('😀'.repeat(180));
    assert.equal(f.run().status, 'PASS', problems(f.run()));
    literal('😀'.repeat(181));
    assert.match(problems(f.run()), /180 Unicode code points/);
});

test('metadata-only skips body budget but final mode applies UTF-8 bytes', (t) => {
    const f = fixture(t);
    const body = `# Contract\n\n${'中'.repeat(1400)}\n`;
    f.write('cocosair-alpha', metadata('cocosair-alpha'), body);
    fs.copyFileSync(
        path.join(f.root, 'skills/cocosair-alpha/SKILL.md'),
        path.join(f.snapshot, 'skills/cocosair-alpha/SKILL.md'),
    );
    const files = enumerateFiles(f.snapshot);
    fs.writeFileSync(
        path.join(f.snapshot, 'manifest.json'),
        JSON.stringify({ schema: 1, base_commit: 'a'.repeat(40), files, snapshot_hash: manifestHash(files) }),
    );
    assert.equal(f.run().status, 'PASS');
    assert.match(problems(f.run({ metadataOnly: false })), /4,000 UTF-8 bytes/);
});

test('frontmatter includes delimiter and newline code points', (t) => {
    const f = fixture(t);
    f.write('cocosair-alpha', metadata('cocosair-alpha', { owns: ['a'.repeat(1100), 'runtime', 'contracts'] }));
    assert.match(problems(f.run()), /1,400 Unicode code points/);
});

test('original read-only permissions cannot be widened or swapped by directory order', (t) => {
    const f = fixture(t);
    f.write('cocosair-beta', metadata('cocosair-beta', { 'allowed-tools': 'Read Edit Write Bash' }));
    assert.match(problems(f.run()), /allowed-tools: Host metadata/);
    f.write('cocosair-beta', metadata('cocosair-beta'));
    f.write('cocosair-alpha', metadata('cocosair-alpha', { 'allowed-tools': 'Read Bash' }));
    assert.match(problems(f.run()), /allowed-tools: Host metadata/);
});

test('host environment, attribution, version, date and Chinese description remain exact strings', (t) => {
    const f = fixture(t);
    for (const field of [
        'license',
        'compatibility',
        'metadata.author',
        'metadata.version',
        'metadata.last-updated',
        'metadata.description_zh',
    ]) {
        const data = metadata('cocosair-alpha');
        if (field.startsWith('metadata.')) data.metadata[field.split('.')[1]] = 7;
        else data[field] = 'changed';
        f.write('cocosair-alpha', data);
        assert.ok(
            f.run().issues.some((issue) => issue.field === field),
            field,
        );
    }
});

test('metadata-only explicitly selected skills leave all other originals byte-identical', (t) => {
    const f = fixture(t);
    f.write('cocosair-alpha', metadata('cocosair-alpha', { description: 'Changed alpha routing.' }));
    assert.equal(f.run({ skills: ['cocosair-alpha'] }).status, 'PASS');
    f.write('cocosair-beta', metadata('cocosair-beta', { description: 'Changed beta routing.' }));
    assert.match(problems(f.run({ skills: ['cocosair-alpha'] })), /Unselected original file changed/);
    assert.throws(() => f.run({ metadataOnly: false, skills: ['cocosair-alpha'] }), /only valid/);
    assert.throws(() => f.run({ skills: ['cocosair-absent'] }), /unknown skill/);
});

test('metadata-only rejects selected body edits and unexpected new references', (t) => {
    const f = fixture(t);
    f.write('cocosair-alpha', metadata('cocosair-alpha'), '# Contract\n\nChanged rule.\n');
    assert.match(problems(f.run({ skills: ['cocosair-alpha'] })), /every original body byte/);
    fs.writeFileSync(path.join(f.root, 'skills/cocosair-alpha/archive.md'), 'premature migration\n');
    assert.match(problems(f.run()), /Unexpected new file/);
});

test('duplicate YAML keys and invalid list types fail rather than taking last value', (t) => {
    const f = fixture(t);
    const file = path.join(f.root, 'skills/cocosair-alpha/SKILL.md');
    fs.writeFileSync(
        file,
        markdown(metadata('cocosair-alpha')).replace('description:', 'name: duplicate\ndescription:'),
    );
    assert.match(problems(f.run()), /duplicated mapping key/);
    f.write(
        'cocosair-alpha',
        metadata('cocosair-alpha', {
            when_to_use: 'not an array',
            owns: ['only'],
            not_for: ['unknown -> cocosair-missing'],
        }),
    );
    const report = f.run();
    assert.ok(report.issues.some((issue) => issue.field === 'when_to_use'));
    assert.ok(report.issues.some((issue) => issue.field === 'owns'));
    assert.ok(report.issues.some((issue) => issue.field === 'not_for'));
});

test('retired, misplaced, duplicate and over-budget routing fields are rejected', (t) => {
    const f = fixture(t);
    const data = metadata('cocosair-alpha', {
        version: '1.0.0',
        description_en: 'old',
        when_to_use: ['one two three four five six seven eight nine ten eleven'],
        owns: ['alpha', 'alpha', 'runtime'],
        not_for: [`${'x'.repeat(70)} -> cocosair-beta`],
        layer: 'router',
    });
    data.metadata.description_en = 'old';
    data.metadata.keywords = 'old';
    f.write('cocosair-alpha', data);
    const report = f.run();
    for (const field of ['version', 'description_en', 'when_to_use', 'owns', 'not_for', 'layer', 'metadata.keywords'])
        assert.ok(
            report.issues.some((issue) => issue.field === field),
            field,
        );
});

test('directory/name mismatch and unknown skill additions fail', (t) => {
    const f = fixture(t);
    f.write('cocosair-alpha', metadata('cocosair-other'));
    assert.match(problems(f.run()), /Name must equal its directory|Original skill is missing|Unexpected skill name/);
});

test('final gate validates index schema and compact per-name object size', (t) => {
    const f = fixture(t);
    const index = {
        schema: 2,
        min_compatible_schema: 2,
        skills: [{ name: 'cocosair-alpha' }, { name: 'cocosair-beta' }],
    };
    const file = path.join(f.root, 'skills/index.json');
    fs.writeFileSync(file, JSON.stringify(index));
    assert.equal(f.run({ metadataOnly: false }).status, 'PASS');
    index.skills[0].extra = '😀'.repeat(2000);
    fs.writeFileSync(file, JSON.stringify(index));
    assert.match(problems(f.run({ metadataOnly: false })), /2,000 Unicode code points/);
    index.schema = 3;
    fs.writeFileSync(file, JSON.stringify(index));
    assert.match(problems(f.run({ metadataOnly: false })), /Expected index schema/);
});

test('CLI is JSON-only, read-only and fails for unknown flags', (t) => {
    const f = fixture(t);
    const script = path.resolve(__dirname, '../verify-meta.cjs');
    const before = enumerateFiles(f.root);
    const pass = spawnSync(process.execPath, [script, '--root', f.root, '--snapshot', f.snapshot, '--metadata-only'], {
        encoding: 'utf8',
    });
    assert.equal(pass.status, 0, pass.stdout + pass.stderr);
    assert.equal(JSON.parse(pass.stdout).status, 'PASS');
    assert.deepEqual(enumerateFiles(f.root), before);
    const fail = spawnSync(process.execPath, [script, '--write'], { encoding: 'utf8' });
    assert.equal(fail.status, 1);
    assert.equal(JSON.parse(fail.stdout).status, 'FAIL');
});
