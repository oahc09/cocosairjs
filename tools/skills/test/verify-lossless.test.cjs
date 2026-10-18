'use strict';

// Recovery tests reconstructed from retained gate test inputs and every subsequent fix.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
    enumerateFiles,
    manifestHash,
    loadSnapshot,
    restoreCheck,
    verifyLossless,
    unitsForFile,
    sha256,
    normalizedTable,
} = require('../verify-lossless.cjs');

const ENTRY = `---
name: cocosair-test
description: Test contracts.
license: MIT
compatibility: Cocos AIR source checkout.
allowed-tools: Read Bash
metadata:
  author: test@example.com
  version: '1.0.0'
  last-updated: '2026-10-13'
  description_zh: 检查契约。
---
# Test

Only use authorized workspaces.

[Source](references/source.md)
`;
const SOURCE = 'skills/cocosair-test/references/source.md';
const TARGET = 'skills/cocosair-test/references/archive.md';

function fixture(t, source = '# Rules\n\nYou must never discard this limitation.\n') {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-lossless-'));
    t.after(() => fs.rmSync(base, { recursive: true, force: true }));
    const root = path.join(base, 'candidate');
    const snapshot = path.join(base, 'snapshot');
    fs.mkdirSync(path.join(root, 'skills/cocosair-test/references'), { recursive: true });
    fs.writeFileSync(path.join(root, 'skills/cocosair-test/SKILL.md'), ENTRY);
    fs.writeFileSync(path.join(root, SOURCE), source);
    fs.cpSync(root, snapshot, { recursive: true });
    const files = enumerateFiles(snapshot);
    const hash = manifestHash(files);
    fs.writeFileSync(
        path.join(snapshot, 'manifest.json'),
        JSON.stringify({ schema: 1, base_commit: 'b'.repeat(40), files, snapshot_hash: hash }),
    );
    const ledger = { schema: 1, source_snapshot_hash: hash, entries: [] };
    const write = (file, text) => {
        const isNew = !fs.existsSync(path.join(root, file));
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), text);
        if (isNew && file.endsWith('.md')) {
            const relative = path.posix.relative('skills/cocosair-test', file);
            fs.appendFileSync(
                path.join(root, 'skills/cocosair-test/SKILL.md'),
                `\n[Preserved reference](${relative})\n`,
            );
        }
    };
    const units = (file, original = false) =>
        unitsForFile(fs.readFileSync(path.join(original ? snapshot : root, file), 'utf8'), file);
    const run = () => verifyLossless({ root, snapshot, ledger, phase: 'P1' });
    const entry = (sourceUnit, targetUnit, options = {}) => ({
        source: sourceUnit.field
            ? { path: SOURCE, field: sourceUnit.field }
            : { path: SOURCE, block_id: sourceUnit.id },
        source_hash: sourceUnit.hash,
        kind: sourceUnit.kind,
        destinations: [{ path: TARGET, block_id: targetUnit.id, hash: targetUnit.hash }],
        operation: 'move',
        link_map: [],
        review: { status: 'approved', reviewer: 'fixture reviewer', notes: 'Compared the full preserved original.' },
        ...options,
    });
    return { base, root, snapshot, ledger, write, units, run, entry };
}
function problems(report) {
    return report.issues.map((issue) => issue.problem).join('\n');
}

test('unchanged tree requires an explicit source-bound ledger and stays read-only', (t) => {
    const f = fixture(t);
    const before = enumerateFiles(f.root);
    assert.equal(f.run().status, 'PASS');
    assert.deepEqual(enumerateFiles(f.root), before);
    assert.throws(() => verifyLossless({ root: f.root, snapshot: f.snapshot }), /ledger is required/);
    f.ledger.source_snapshot_hash = '0'.repeat(64);
    assert.throws(f.run, /Ledger snapshot hash mismatch/);
});

test('every removed prose block and heading needs a valid explicit mapping', (t) => {
    const f = fixture(t);
    f.write(SOURCE, '# Short summary\n');
    assert.match(problems(f.run()), /lacks valid ledger mapping/);
    const old = f.units(SOURCE, true);
    f.write(TARGET, old.map((unit) => unit.text).join('\n'));
    const target = f.units(TARGET);
    f.ledger.entries.push(...old.map((unit, index) => f.entry(unit, target[index])));
    assert.equal(f.run().status, 'PASS', problems(f.run()));
});

test('summaries alone cannot preserve original qualifiers', (t) => {
    const f = fixture(t);
    const original = f.units(SOURCE, true)[1];
    f.write(SOURCE, '# Rules\n');
    f.write(TARGET, 'Discard this limitation.\n');
    f.ledger.entries.push(f.entry(original, f.units(TARGET)[0], { operation: 'summarize' }));
    assert.match(problems(f.run()), /not fully preserved/);
});

test('tampered original snapshot bytes and manifest fingerprints fail closed', (t) => {
    const f = fixture(t);
    fs.appendFileSync(path.join(f.snapshot, SOURCE), 'tampered\n');
    assert.throws(() => loadSnapshot(f.snapshot), /Snapshot disk mismatch/);
    fs.writeFileSync(path.join(f.snapshot, SOURCE), '# Rules\n\nYou must never discard this limitation.\n');
    const file = path.join(f.snapshot, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file));
    manifest.files[0].sha256 = '0'.repeat(64);
    fs.writeFileSync(file, JSON.stringify(manifest));
    assert.throws(() => loadSnapshot(f.snapshot), /Snapshot manifest hash mismatch/);
});

test('source and destination hashes independently detect tampering', (t) => {
    const f = fixture(t);
    const source = f.units(SOURCE, true)[1];
    f.write(SOURCE, '# Rules\n');
    f.write(TARGET, source.text);
    const entry = f.entry(source, f.units(TARGET)[0]);
    f.ledger.entries.push(entry);
    assert.equal(f.run().status, 'PASS');
    entry.source_hash = '0'.repeat(64);
    assert.match(problems(f.run()), /Source hash mismatch/);
    entry.source_hash = source.hash;
    f.write(TARGET, source.text.replace('never', 'sometimes'));
    assert.match(problems(f.run()), /Destination hash mismatch/);
});

test('unreviewed entries, empty destinations and unknown phases fail closed', (t) => {
    const f = fixture(t);
    const source = f.units(SOURCE, true)[1];
    f.write(SOURCE, '# Rules\n');
    f.write(TARGET, source.text);
    const entry = f.entry(source, f.units(TARGET)[0]);
    f.ledger.entries.push(entry);
    entry.review.status = 'pending';
    assert.match(problems(f.run()), /lacks an explicit approved review/);
    entry.review.status = 'approved';
    entry.destinations = [];
    assert.match(problems(f.run()), /Empty ledger destinations/);
    assert.throws(
        () => verifyLossless({ root: f.root, snapshot: f.snapshot, ledger: f.ledger, phase: 'P2' }),
        /Only P1/,
    );
});

test('metadata original values can be fully archived, with exact field hashes', (t) => {
    const f = fixture(t);
    const file = 'skills/cocosair-test/SKILL.md';
    const source = f.units(file, true).find((unit) => unit.field === 'description');
    f.write(file, ENTRY.replace('Test contracts.', 'Shorter.'));
    f.write(TARGET, `${source.text}\n`);
    f.ledger.entries.push(f.entry(source, f.units(TARGET)[0], { source: { path: file, field: 'description' } }));
    assert.equal(source.hash, sha256(JSON.stringify('Test contracts.')));
    assert.equal(f.run().status, 'PASS', problems(f.run()));
});

test('host permissions cannot change even if old declaration has an archived ledger destination', (t) => {
    const f = fixture(t);
    const file = 'skills/cocosair-test/SKILL.md';
    const source = f.units(file, true).find((unit) => unit.field === 'allowed-tools');
    f.write(file, ENTRY.replace('Read Bash', 'Read Edit Write Bash'));
    f.write(TARGET, `${source.text}\n`);
    f.ledger.entries.push(f.entry(source, f.units(TARGET)[0], { source: { path: file, field: 'allowed-tools' } }));
    assert.match(problems(f.run()), /Host metadata must remain/);
});

test('code body must be byte-exact even when fence style changes', (t) => {
    const f = fixture(t, '# Rules\n\n```js\nconst x = 1;\n```\n');
    const source = f.units(SOURCE, true)[1];
    f.write(SOURCE, '# Rules\n');
    f.write(TARGET, '~~~~js\nconst x = 1;\n~~~~\n');
    f.ledger.entries.push(f.entry(source, f.units(TARGET)[0]));
    assert.equal(f.run().status, 'PASS');
    f.write(TARGET, '~~~~js\nconst  x = 1;\n~~~~\n');
    f.ledger.entries[0].destinations[0].hash = f.units(TARGET)[0].hash;
    assert.match(problems(f.run()), /Code body hash changed/);
});

test('table alignment and row order can change, but cell values and row multiplicity cannot', (t) => {
    const before = '| A | B |\n| --- | --- |\n| x | only 2 |\n| y | never |\n';
    const after = '| A  | B      |\n| --- | --- |\n| y  | never  |\n| x  | only 2 |\n';
    assert.deepEqual(normalizedTable(before), normalizedTable(after));
    const f = fixture(t, `# Rules\n\n${before}`);
    const source = f.units(SOURCE, true)[1];
    f.write(SOURCE, '# Rules\n');
    f.write(TARGET, after);
    f.ledger.entries.push(f.entry(source, f.units(TARGET)[0]));
    assert.equal(f.run().status, 'PASS');
    f.write(TARGET, after.replace('only 2', 'only 3'));
    f.ledger.entries[0].destinations[0].hash = f.units(TARGET)[0].hash;
    assert.match(problems(f.run()), /Table cell\/row multiset changed/);
});

for (const [kind, content] of [
    ['prose', 'Never remove a qualifier.\n'],
    ['code', '```js\nconst limit = 2;\n```\n'],
    ['table', '| A | B |\n| --- | --- |\n| x | only 2 |\n'],
]) {
    test(`${kind} duplicate deletion requires explicit deduplication, including range aliases`, (t) => {
        const f = fixture(t, `# Rules\n\n${content}\n${content}`);
        const source = f.units(SOURCE, true).filter((unit) => unit.kind === kind)[1];
        f.write(SOURCE, `# Rules\n\n${content}`);
        const target = f.units(SOURCE).find((unit) => unit.kind === kind);
        const entry = f.entry(source, target, {
            destinations: [{ path: SOURCE, block_id: target.id, hash: target.hash }],
        });
        f.ledger.entries.push(entry);
        assert.match(problems(f.run()), /requires explicit deduplication/);
        entry.destinations = [
            { path: SOURCE, start_line: target.startLine, end_line: target.endLine, hash: target.hash },
        ];
        assert.match(problems(f.run()), /requires explicit deduplication/);
        entry.operation = 'deduplicate';
        entry.review.equivalence = 'Both source instances contain exactly the same full original contract.';
        assert.equal(f.run().status, 'PASS', problems(f.run()));
    });
}

test('recorded link edits require same logical target and preserve all surrounding prose', (t) => {
    const f = fixture(t, '# Rules\n\nYou must read [contract](target.md#rule) first.\n');
    f.write('skills/cocosair-test/references/target.md', '# Target\n\n## Rule\n');
    const source = f.units(SOURCE, true)[1];
    const targetPath = 'skills/cocosair-test/archive.md';
    f.write(SOURCE, '# Rules\n');
    f.write(targetPath, 'You must read [contract](references/target.md#rule) first.\n');
    const target = f.units(targetPath)[0];
    f.ledger.entries.push(
        f.entry(source, target, {
            destinations: [{ path: targetPath, block_id: target.id, hash: target.hash }],
            link_map: [{ from: 'target.md#rule', to: 'references/target.md#rule', destination_path: targetPath }],
        }),
    );
    assert.equal(f.run().status, 'PASS', problems(f.run()));
    f.ledger.entries[0].link_map[0].to = 'references/other.md#rule';
    assert.match(problems(f.run()), /changes logical target/);
});

test('unrecorded link edits and invented mappings cannot be normalized away', (t) => {
    const f = fixture(t, '# Rules\n\nRead [contract](target.md).\n');
    const source = f.units(SOURCE, true)[1];
    f.write(SOURCE, '# Rules\n');
    f.write(TARGET, 'Read [contract](./target.md).\n');
    const entry = f.entry(source, f.units(TARGET)[0]);
    f.ledger.entries.push(entry);
    assert.match(problems(f.run()), /not fully preserved/);
    entry.link_map = [{ from: 'absent.md', to: 'absent.md', destination_path: TARGET }];
    assert.match(problems(f.run()), /link absent/);
});

test('restore performs a fresh exact disk enumeration and never executes restored scripts', (t) => {
    const f = fixture(t);
    const output = path.join(f.base, 'restored');
    const report = restoreCheck(f.snapshot, output);
    assert.equal(report.status, 'PASS');
    assert.equal(report.executed_restored_code, false);
    assert.equal(report.source_rechecked, true);
    assert.equal(report.restored_hash, report.snapshot_hash);
    assert.deepEqual(report.original_manifest, report.restored_manifest);
    assert.equal(fs.statSync(path.join(output, SOURCE)).mode & 0o111, 0);
});

test('restore rejects existing output, source-tree destinations, symlinks and nonexistent parent', (t) => {
    const f = fixture(t);
    const existing = path.join(f.base, 'existing');
    fs.mkdirSync(existing);
    assert.throws(() => restoreCheck(f.snapshot, existing), /new, nonexistent/);
    assert.throws(() => restoreCheck(f.snapshot, path.join(f.snapshot, 'new')), /isolated/);
    assert.throws(() => restoreCheck(f.snapshot, path.join(f.base, 'missing', 'new')), /ENOENT/);
    const symlink = path.join(f.base, 'linked');
    fs.symlinkSync(f.root, symlink, 'dir');
    assert.throws(() => restoreCheck(f.snapshot, path.join(symlink, 'new')), /Symlink/);
    const dangling = path.join(f.base, 'dangling');
    fs.symlinkSync(path.join(f.base, 'missing-target'), dangling, 'dir');
    assert.throws(() => restoreCheck(f.snapshot, dangling), /Symlink/);
});

test('snapshots reject added files, symlinks, path traversal and duplicate manifest paths', (t) => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.snapshot, 'skills/extra.txt'), 'extra');
    assert.throws(() => loadSnapshot(f.snapshot), /Snapshot disk mismatch/);
    fs.unlinkSync(path.join(f.snapshot, 'skills/extra.txt'));
    fs.symlinkSync(path.join(f.root, SOURCE), path.join(f.snapshot, 'skills/link'));
    assert.throws(() => loadSnapshot(f.snapshot), /Symlink/);
    fs.unlinkSync(path.join(f.snapshot, 'skills/link'));
    const file = path.join(f.snapshot, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file));
    manifest.files.push({ ...manifest.files[0] });
    fs.writeFileSync(file, JSON.stringify(manifest));
    assert.throws(() => loadSnapshot(f.snapshot), /Duplicate snapshot path/);
    manifest.files[manifest.files.length - 1].path = 'skills/../../escape';
    fs.writeFileSync(file, JSON.stringify(manifest));
    assert.throws(() => loadSnapshot(f.snapshot), /Unsafe repository-relative path/);
});

test('CLI only emits parseable JSON and rejects a write mode without explicit restore output', (t) => {
    const f = fixture(t);
    const script = path.resolve(__dirname, '../verify-lossless.cjs');
    const result = spawnSync(process.execPath, [script, '--restore-check', f.snapshot], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).status, 'FAIL');
    assert.equal(fs.existsSync(path.join(f.base, 'restored')), false);
});

test('one approved deduplication cannot exempt a third source move to the same destination', (t) => {
    const content = 'Never remove a qualifier.\n';
    const f = fixture(t, `# Rules\n\n${content}\n${content}\n${content}`);
    const original = f.units(SOURCE, true).filter((unit) => unit.kind === 'prose');
    f.write(SOURCE, `# Rules\n\n${content}`);
    const target = f.units(SOURCE).find((unit) => unit.kind === 'prose');
    for (const [index, source] of original.slice(1).entries())
        f.ledger.entries.push(
            f.entry(source, target, {
                destinations: [{ path: SOURCE, block_id: target.id, hash: target.hash }],
                operation: index === 0 ? 'deduplicate' : 'move',
                review: {
                    status: 'approved',
                    reviewer: 'fixture reviewer',
                    notes: 'Full bytes compared.',
                    equivalence: 'Exact duplicates.',
                },
            }),
        );
    assert.match(problems(f.run()), /requires explicit deduplication/);
    f.ledger.entries[1].operation = 'deduplicate';
    assert.equal(f.run().status, 'PASS', problems(f.run()));
});

test('a full original archived in an unlinked file is not reachable preservation', (t) => {
    const f = fixture(t);
    const source = f.units(SOURCE, true)[1];
    f.write(SOURCE, '# Rules\n');
    f.write(TARGET, source.text);
    f.write('skills/cocosair-test/SKILL.md', ENTRY);
    f.ledger.entries.push(f.entry(source, f.units(TARGET)[0]));
    assert.match(problems(f.run()), /not reachable from a SKILL entry/);
});

test('inline code whitespace remains exact while prose layout can change', (t) => {
    const f = fixture(t, '# Rules\n\nOnly use `a  b` after setup.\n');
    const source = f.units(SOURCE, true)[1];
    f.write(SOURCE, '# Rules\n');
    f.write(TARGET, 'Only  use `a  b`\nafter setup.\n');
    const entry = f.entry(source, f.units(TARGET)[0]);
    f.ledger.entries.push(entry);
    assert.equal(f.run().status, 'PASS');
    f.write(TARGET, 'Only use `a b` after setup.\n');
    entry.destinations[0].hash = f.units(TARGET)[0].hash;
    entry.destinations[0].block_id = f.units(TARGET)[0].id;
    assert.match(problems(f.run()), /not fully preserved/);
});

test('table header roles, inline code spaces and duplicate rows are preserved', () => {
    const original = '| A | B |\n| --- | --- |\n| x | `a  b` |\n| x | `a  b` |\n';
    assert.notDeepEqual(normalizedTable(original), normalizedTable(original.replace('`a  b`', '`a b`')));
    assert.notDeepEqual(
        normalizedTable(original),
        normalizedTable('| x | `a  b` |\n| --- | --- |\n| A | B |\n| x | `a  b` |\n'),
    );
    assert.notDeepEqual(normalizedTable(original), normalizedTable('| A | B |\n| --- | --- |\n| x | `a  b` |\n'));
});
