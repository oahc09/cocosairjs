'use strict';

// These are fresh recovery regressions, not historical execution evidence.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseMarkdown, inventory, sha256 } = require('../lib/md-parse.cjs');
const { loadRoutingRecords, serializeRoutingRecord } = require('../gen-index.cjs');
const {
    METRIC_VERSION,
    size,
    l0,
    measure,
    verifiedSnapshot,
    validateScenarios,
    aggregateLoads,
    compareLoads,
} = require('../measure-tokens.cjs');

const ROUTER = 'skills/cocosair/SKILL.md';
const MEDIUM = 'skills/cocosair-rendering/references/lighting-units.md';
const GIANT = 'skills/cocosair-rendering/references/pipeline-reachability.md';
const cliPath = path.resolve(__dirname, '../measure-tokens.cjs');
const clone = (value) => JSON.parse(JSON.stringify(value));

function write(root, relative, content) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), content);
}

function snapshot(root) {
    const files = inventory(path.join(root, 'skills'));
    const manifest = { schema: 1, base_commit: 'a'.repeat(40), files, snapshot_hash: sha256(JSON.stringify(files)) };
    write(root, 'manifest.json', JSON.stringify(manifest));
    return manifest;
}

function fixture(t) {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-measure-'));
    t.after(() => fs.rmSync(base, { recursive: true, force: true }));
    const root = path.join(base, 'original');
    const names = [
        'cocosair',
        'cocosair-rendering',
        ...Array.from({ length: 20 }, (_, i) => `cocosair-test-${String(i).padStart(2, '0')}`),
    ];
    for (const name of names.reverse()) {
        write(
            root,
            `skills/${name}/SKILL.md`,
            `---\nname: ${name}\ndescription: "Inspect 光照 😀 ${name}."\n---\n# Rules\n\nOnly authorized workspaces.\n`,
        );
    }
    write(root, MEDIUM, '# Light\n\nLight uses lux. 光照😀\n\n# Shadow\n\nFour switches are required.\n');
    write(
        root,
        GIANT,
        `# Pipeline\n\nAn exported name does not prove reachability. ${'Configuration requires verified conditions. '.repeat(400)}\n`,
    );
    write(
        root,
        'skills/cocosair-rendering/references/context.md',
        '# Environment\n\nUse an authorized source checkout.\n',
    );
    write(root, 'skills/README.md', 'Read the router.\n');
    const manifest = snapshot(root);
    const selector = (relative) => {
        const parsed = parseMarkdown(fs.readFileSync(path.join(root, relative), 'utf8'), { path: relative });
        const block = parsed.blocks.find((candidate) => candidate.kind === 'prose');
        assert.ok(block);
        return { path: relative, block_id: block.id, hash: block.hash };
    };
    const protocol = {
        version: 'air-reading-recovery-1',
        operator: 'Independent cold reader',
        reading_method: 'Read complete UTF-8 document payloads',
        stop_condition: 'Stop after enough evidence to answer the frozen question',
        field_rendering: 'host-minimal serializer, name sorted and joined with LF',
        tool_text_scope: 'Document text only; repeated reads charged',
        clean_context: true,
        profile: 'A',
        router: ROUTER,
        receipts: 'Untruncated L0 and every document payload',
    };
    const scenarios = {
        schema: 1,
        source_snapshot_hash: manifest.snapshot_hash,
        recovery_run: 'recovery-2026-10-18',
        scenarios: ['B1', 'B2'].map((id) => {
            const source = selector(id === 'B1' ? MEDIUM : GIANT);
            return {
                id,
                question:
                    id === 'B1'
                        ? 'Which light units and shadow switches apply?'
                        : 'Does an exported pipeline name prove reachability?',
                completion_checks: [
                    { id: `${id}-fact`, criterion: 'State the factual prerequisite.', sources: [source] },
                ],
                expected_owner: 'cocosair-rendering',
                source_snapshot_hash: manifest.snapshot_hash,
                source_refs: [source],
                read_protocol: clone(protocol),
                metric_version: METRIC_VERSION,
            };
        }),
    };
    const scenariosPath = path.join(base, 'load-scenarios.json');
    const saveScenarios = () => fs.writeFileSync(scenariosPath, `${JSON.stringify(scenarios, null, 2)}\n`);
    saveScenarios();
    const loadsPath = path.join(base, 'loads.jsonl');
    const read = (relative, rootInput = root) => {
        const bytes = fs.readFileSync(path.join(rootInput, relative));
        return {
            path: relative,
            content_hash: sha256(bytes),
            read_chars: [...bytes.toString('utf8')].length,
            read_bytes: bytes.length,
            whole_file: true,
            fragments: [],
            received_untruncated: true,
        };
    };
    const task = (id = 'B1', rootInput = root) => {
        const scenario = scenarios.scenarios.find((entry) => entry.id === id);
        const answer =
            id === 'B1'
                ? 'Light uses lux. Four switches are required.'
                : 'An exported name does not prove reachability.';
        const answerPath = `answers/${id}.md`;
        write(base, answerPath, answer);
        return {
            task_id: `task-${id}`,
            started_at: '2026-10-18T06:00:00Z',
            outcome: 'success',
            complete: true,
            snapshot_hash: verifiedSnapshot(rootInput).snapshotHash,
            source_snapshot_hash: manifest.snapshot_hash,
            scenario_id: id,
            metric_version: METRIC_VERSION,
            question_hash: sha256(scenario.question),
            read_protocol_hash: sha256(JSON.stringify(scenario.read_protocol)),
            scenario_fixture_hash: sha256(fs.readFileSync(scenariosPath)),
            l0_hash: l0(rootInput).hash,
            l0_received_untruncated: true,
            reads: [read(ROUTER, rootInput), read(id === 'B1' ? MEDIUM : GIANT, rootInput)],
            answer_checks: [{ id: `${id}-fact`, passed: true, evidence: answer }],
            answer_artifact: answerPath,
            answer_hash: sha256(answer),
        };
    };
    const saveLoads = (records, filename = loadsPath) =>
        fs.writeFileSync(filename, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
    const run = (records, options = {}) => {
        saveLoads(records);
        return aggregateLoads(loadsPath, root, { scenarios: scenariosPath, ...options });
    };
    const m2 = (records) => {
        saveLoads(records);
        return aggregateLoads(loadsPath, root);
    };
    const realTask = (number = 1) => ({
        task_id: `real-${number}`,
        task_kind: 'real',
        started_at: '2026-10-18T06:00:00Z',
        outcome: 'success',
        snapshot_hash: manifest.snapshot_hash,
        complete: true,
        reads: [read(ROUTER)],
    });
    return {
        base,
        root,
        manifest,
        scenarios,
        scenariosPath,
        loadsPath,
        saveScenarios,
        read,
        task,
        saveLoads,
        run,
        m2,
        realTask,
    };
}

function taskErrors(report) {
    return [...report.errors, ...report.tasks.flatMap((task) => task.errors)].join('\n');
}

function cli(...args) {
    const result = spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });
    assert.equal(result.signal, null, result.stderr);
    return { code: result.status, report: JSON.parse(result.stdout), stderr: result.stderr };
}

test('Unicode code points, UTF-8 bytes, Han and other-token estimates are distinct', () => {
    assert.deepEqual(size('A😀中𠀀'), {
        chars: 4,
        bytes: 12,
        han_chars: 2,
        other_chars: 2,
        estimated_tokens: 2 / 1.5 + 2 / 3.8,
    });
    assert.equal(size('\ufeffa').bytes, 4);
    assert.throws(() => size(Buffer.from('text')), /string/);
});

test('L0 is exactly 22 name-sorted shared host-minimal serializations joined with LF', (t) => {
    const f = fixture(t);
    const expected = loadRoutingRecords(f.root)
        .sort((a, b) => (a.name < b.name ? -1 : 1))
        .map((record) => serializeRoutingRecord(record, 'host-minimal'))
        .join('\n');
    const actual = l0(f.root);
    assert.equal(actual.text, expected);
    assert.equal(actual.hash, sha256(expected));
    assert.equal(actual.record_count, 22);
    assert.equal(actual.chars, [...expected].length);
    assert.equal(actual.bytes, Buffer.byteLength(expected));
    fs.rmSync(path.join(f.root, 'skills/cocosair-test-00'), { recursive: true });
    assert.throws(() => l0(f.root), /exactly 22/);
});

test('static full, original raw frontmatter and body have separate deterministic layers', (t) => {
    const f = fixture(t);
    const report = measure(f.root);
    assert.equal(report.source_manifest_hash, f.manifest.snapshot_hash);
    assert.equal(
        report.layers.skill_full.bytes,
        report.layers.original_frontmatter.bytes + report.layers.skill_body.bytes,
    );
    assert.equal(
        report.layers.skill_full.chars,
        report.layers.original_frontmatter.chars + report.layers.skill_body.chars,
    );
    const router = report.files.find((file) => file.path === ROUTER);
    const source = fs.readFileSync(path.join(f.root, ROUTER), 'utf8');
    const parsed = parseMarkdown(source, { path: ROUTER });
    assert.deepEqual(router.frontmatter, size(parsed.frontmatter.raw));
    assert.ok(parsed.frontmatter.raw.startsWith('---\n'));
    assert.ok(parsed.frontmatter.raw.endsWith('---\n'));
    assert.deepEqual(report, measure(f.root));
    assert.equal(report.giant_reference_count, 1);
});

test('verified snapshots reject on-disk edits, missing or additional files', (t) => {
    const f = fixture(t);
    assert.equal(verifiedSnapshot(f.root).snapshotHash, f.manifest.snapshot_hash);
    fs.appendFileSync(path.join(f.root, MEDIUM), 'changed');
    assert.throws(() => verifiedSnapshot(f.root), /disk inventory/);
    snapshot(f.root);
    fs.unlinkSync(path.join(f.root, MEDIUM));
    assert.throws(() => verifiedSnapshot(f.root), /disk inventory/);
    snapshot(f.root);
    write(f.root, 'skills/extra.md', 'extra');
    assert.throws(() => verifiedSnapshot(f.root), /disk inventory/);
});

test('snapshot schema, canonical ordering, digest, blob digest and unsafe paths are verified', (t) => {
    const f = fixture(t);
    const manifestPath = path.join(f.root, 'manifest.json');
    for (const mutate of [
        (value) => {
            value.schema = 2;
        },
        (value) => {
            value.files.reverse();
            value.snapshot_hash = sha256(JSON.stringify(value.files));
        },
        (value) => {
            value.snapshot_hash = '0'.repeat(64);
        },
        (value) => {
            value.files[0].git_blob_sha = '0'.repeat(40);
            value.snapshot_hash = sha256(JSON.stringify(value.files));
        },
        (value) => {
            value.files[0].path = 'skills/../outside.md';
            value.snapshot_hash = sha256(JSON.stringify(value.files));
        },
        (value) => {
            value.files.push(clone(value.files[0]));
            value.snapshot_hash = sha256(JSON.stringify(value.files));
        },
    ]) {
        const value = clone(f.manifest);
        mutate(value);
        fs.writeFileSync(manifestPath, JSON.stringify(value));
        assert.throws(() => verifiedSnapshot(f.root));
    }
});

test('snapshot root, parent, manifest and source symlinks fail closed', (t) => {
    const f = fixture(t);
    fs.symlinkSync(f.root, path.join(f.base, 'linked'), 'dir');
    assert.throws(() => verifiedSnapshot(path.join(f.base, 'linked')), /[Ss]ymlink/);
    const manifest = fs.readFileSync(path.join(f.root, 'manifest.json'));
    write(f.base, 'manifest-copy.json', manifest);
    fs.unlinkSync(path.join(f.root, 'manifest.json'));
    fs.symlinkSync(path.join(f.base, 'manifest-copy.json'), path.join(f.root, 'manifest.json'));
    assert.throws(() => verifiedSnapshot(f.root), /[Ss]ymlink/);
    fs.unlinkSync(path.join(f.root, 'manifest.json'));
    write(f.root, 'manifest.json', manifest);
    fs.unlinkSync(path.join(f.root, MEDIUM));
    fs.symlinkSync(path.join(f.root, GIANT), path.join(f.root, MEDIUM));
    assert.throws(() => verifiedSnapshot(f.root), /[Ss]ymlink/);
});

test('scenario fixtures require schema, exactly B1/B2, frozen protocol and real source blocks', (t) => {
    const f = fixture(t);
    assert.equal(validateScenarios(f.scenariosPath, f.root).fixture_hash, sha256(fs.readFileSync(f.scenariosPath)));
    const original = clone(f.scenarios);
    for (const mutate of [
        (value) => {
            value.schema = 0;
        },
        (value) => {
            value.scenarios[1].id = 'B1';
        },
        (value) => {
            value.source_snapshot_hash = '0'.repeat(64);
        },
        (value) => {
            value.scenarios[0].metric_version = 'bad';
        },
        (value) => {
            value.scenarios[0].read_protocol.clean_context = false;
        },
        (value) => {
            delete value.scenarios[0].read_protocol.stop_condition;
        },
        (value) => {
            value.scenarios[0].source_refs[0].hash = '0'.repeat(64);
        },
        (value) => {
            value.scenarios[0].completion_checks[0].sources[0].block_id = 'unknown';
        },
        (value) => {
            value.scenarios[0].completion_checks[0].criterion = '';
        },
    ]) {
        const value = clone(original);
        mutate(value);
        fs.writeFileSync(f.scenariosPath, JSON.stringify(value));
        assert.throws(() => validateScenarios(f.scenariosPath, f.root));
    }
});

test('B2 always requires a genuine at-least-15000-byte pipeline source', (t) => {
    const f = fixture(t);
    f.scenarios.scenarios[1].source_refs = [clone(f.scenarios.scenarios[0].source_refs[0])];
    f.scenarios.scenarios[1].completion_checks[0].sources = clone(f.scenarios.scenarios[1].source_refs);
    f.saveScenarios();
    assert.throws(() => validateScenarios(f.scenariosPath, f.root), /pipeline-reachability/);
});

test('valid fixed loads count L0 once and preserve every repeated nonrouter read', (t) => {
    const f = fixture(t);
    const task = f.task();
    const report = f.run([task]);
    assert.equal(report.status, 'PASS', taskErrors(report));
    assert.equal(report.tasks[0].C, report.l0.chars + task.reads.reduce((sum, read) => sum + read.read_chars, 0));
    assert.equal(report.tasks[0].bytes, report.l0.bytes + task.reads.reduce((sum, read) => sum + read.read_bytes, 0));
    task.reads.push(f.read(MEDIUM));
    const repeated = f.run([task]);
    assert.equal(repeated.tasks[0].C - report.tasks[0].C, task.reads[2].read_chars);
    assert.equal(repeated.tasks[0].unique_references, 1);
    assert.ok(repeated.tasks[0].estimated_tokens > report.tasks[0].estimated_tokens);
});

test('fragment costs use inclusive 1-based lines, real bytes and exact fragment hashes', (t) => {
    const f = fixture(t);
    const task = f.task();
    const text = fs.readFileSync(path.join(f.root, MEDIUM), 'utf8');
    const lines = text.match(/[^\n]*\n|[^\n]+$/g);
    const selected = lines.slice(2, 3).join('') + lines.slice(6, 7).join('');
    task.reads[1] = {
        ...task.reads[1],
        whole_file: false,
        fragments: [
            { start_line: 3, end_line: 3, hash: sha256(lines[2]) },
            { start_line: 7, end_line: 7, hash: sha256(lines[6]) },
        ],
        read_chars: size(selected).chars,
        read_bytes: size(selected).bytes,
    };
    const report = f.run([task]);
    assert.equal(report.status, 'PASS', taskErrors(report));
    assert.equal(report.tasks[0].read_chars, task.reads[0].read_chars + size(selected).chars);
});

test('empty reads, missing fragments, overlap, wrong endpoints and wrong fragment hashes fail', (t) => {
    const f = fixture(t);
    for (const mutate of [
        (task) => {
            task.reads = [];
        },
        (task) => {
            task.reads[1].whole_file = false;
        },
        (task) => {
            task.reads[1].fragments = [{ start_line: 1, end_line: 1, hash: '0'.repeat(64) }];
        },
        (task) => {
            task.reads[1].whole_file = false;
            task.reads[1].fragments = [{ start_line: 0, end_line: 1, hash: '0'.repeat(64) }];
        },
        (task) => {
            task.reads[1].whole_file = false;
            task.reads[1].fragments = [{ start_line: 1, end_line: 999, hash: '0'.repeat(64) }];
        },
        (task) => {
            task.reads[1].whole_file = false;
            task.reads[1].fragments = [
                { start_line: 1, end_line: 1, hash: sha256('# Light\n') },
                { start_line: 1, end_line: 1, hash: sha256('# Light\n') },
            ];
        },
    ]) {
        const task = f.task();
        mutate(task);
        const report = f.run([task]);
        assert.equal(report.status, 'FAIL');
        assert.equal(report.tasks[0].C, null);
        assert.equal(report.tasks[0].bytes, null);
        assert.equal(report.tasks[0].estimated_tokens, null);
    }
});

test('missing, partial and duplicated router reads cannot establish Profile A benefit', (t) => {
    const f = fixture(t);
    for (const mutate of [
        (task) => {
            task.reads.shift();
        },
        (task) => {
            task.reads[0].whole_file = false;
        },
        (task) => {
            task.reads.push(f.read(ROUTER));
        },
    ]) {
        const task = f.task();
        mutate(task);
        assert.match(taskErrors(f.run([task])), /exactly one complete router/);
    }
});

test('missing or false L0 and per-read receipt flags fail rather than assuming full receipt', (t) => {
    const f = fixture(t);
    for (const mutate of [
        (task) => {
            delete task.l0_received_untruncated;
        },
        (task) => {
            task.l0_received_untruncated = false;
        },
        (task) => {
            delete task.reads[0].received_untruncated;
        },
        (task) => {
            task.reads[1].received_untruncated = false;
        },
    ]) {
        const task = f.task();
        mutate(task);
        const report = f.run([task]);
        assert.match(taskErrors(report), /untruncated receipt/);
        assert.equal(report.tasks[0].C, null);
    }
});

test('question, protocol, fixture, metric, snapshot and L0 hashes bind every fixed task', (t) => {
    const f = fixture(t);
    for (const field of [
        'question_hash',
        'read_protocol_hash',
        'scenario_fixture_hash',
        'snapshot_hash',
        'source_snapshot_hash',
        'l0_hash',
        'metric_version',
    ]) {
        const task = f.task();
        task[field] = '0'.repeat(64);
        assert.equal(f.run([task]).tasks[0].C, null, field);
    }
    const task = f.task();
    task.question = 'Changed question';
    assert.match(taskErrors(f.run([task])), /question changed/);
});

test('paths, full content hashes and actual char/byte counts cannot be fabricated', (t) => {
    const f = fixture(t);
    for (const mutate of [
        (task) => {
            task.reads[1].path = '../secret.md';
        },
        (task) => {
            task.reads[1].path = 'skills/../secret.md';
        },
        (task) => {
            task.reads[1].path = 'skills\\secret.md';
        },
        (task) => {
            task.reads[1].path = '/etc/passwd';
        },
        (task) => {
            task.reads[1].path = 'skills/missing.md';
        },
        (task) => {
            task.reads[1].content_hash = '0'.repeat(64);
        },
        (task) => {
            task.reads[1].read_chars++;
        },
        (task) => {
            task.reads[1].read_bytes--;
        },
    ]) {
        const task = f.task();
        mutate(task);
        const report = f.run([task]);
        assert.equal(report.tasks[0].status, 'FAIL');
        assert.equal(report.tasks[0].C, null);
        assert.equal(typeof report.tasks[0].recorded_C, 'number');
    }
});

test('failed, blocked, incomplete and invalid-time fixed tasks retain evidence but never savings', (t) => {
    const f = fixture(t);
    for (const mutate of [
        (task) => {
            task.outcome = 'failure';
        },
        (task) => {
            task.outcome = 'blocked';
        },
        (task) => {
            task.outcome = 'other';
        },
        (task) => {
            task.complete = false;
        },
        (task) => {
            task.started_at = '2026-10-18T06:00:00';
        },
        (task) => {
            task.started_at = '2026-02-31T06:00:00Z';
        },
        (task) => {
            task.task_id = '';
        },
    ]) {
        const task = f.task();
        mutate(task);
        const report = f.run([task]);
        assert.equal(report.tasks[0].status, 'FAIL');
        assert.equal(report.tasks[0].C, null);
        assert.equal(report.tasks[0].reads.length, 2);
    }
    const task = f.task();
    const duplicates = f.run([task, clone(task)]);
    assert.equal(duplicates.tasks.length, 2);
    assert.ok(duplicates.tasks.every((entry) => entry.status === 'FAIL'));
});

test('answer checks require every frozen check, success and actual answer-text evidence', (t) => {
    const f = fixture(t);
    for (const mutate of [
        (task) => {
            task.answer_checks = [];
        },
        (task) => {
            task.answer_checks[0].passed = false;
        },
        (task) => {
            task.answer_checks[0].id = 'unknown';
        },
        (task) => {
            task.answer_checks[0].evidence = '';
        },
        (task) => {
            task.answer_checks[0].evidence = 'Not actually in the answer.';
        },
        (task) => {
            task.answer_hash = '0'.repeat(64);
        },
        (task) => {
            task.answer_artifact = 'missing-answer.md';
        },
        (task) => {
            task.answer_artifact = '../outside.md';
        },
    ]) {
        const task = f.task();
        mutate(task);
        const report = f.run([task]);
        assert.equal(report.tasks[0].C, null);
    }
});

test('answer symlinks and symlink parents outside the log directory are rejected', (t) => {
    const f = fixture(t);
    const task = f.task();
    fs.renameSync(path.join(f.base, 'answers'), path.join(f.base, 'outside-answers'));
    fs.symlinkSync(path.join(f.base, 'outside-answers'), path.join(f.base, 'answers'), 'dir');
    assert.match(taskErrors(f.run([task])), /[Ss]ymlink/);
});

test('empty and malformed JSONL logs fail; valid siblings do not hide malformed events', (t) => {
    const f = fixture(t);
    assert.equal(f.run([]).status, 'FAIL');
    const task = f.task();
    f.saveLoads([task]);
    fs.appendFileSync(f.loadsPath, '{broken\n');
    const report = aggregateLoads(f.loadsPath, f.root, { scenarios: f.scenariosPath });
    assert.equal(report.status, 'FAIL');
    assert.equal(report.tasks.length, 1);
    assert.match(report.errors.join('\n'), /Line 2/);
});

test('M2 retains failed and zero-reference real tasks, deduplicates references and excludes context', (t) => {
    const f = fixture(t);
    const failed = f.realTask(1);
    failed.outcome = 'failure';
    const zero = f.realTask(2);
    const references = f.realTask(3);
    references.reads.push(
        f.read(MEDIUM),
        f.read(MEDIUM),
        f.read(GIANT),
        f.read('skills/cocosair-rendering/references/context.md'),
    );
    const report = f.m2([failed, zero, references]);
    assert.equal(report.validation_status, 'PASS', taskErrors(report));
    assert.equal(report.status, 'INSUFFICIENT_EVIDENCE');
    assert.equal(report.m2.complete_real_tasks, 3);
    assert.equal(report.m2.average_references, 2 / 3);
    assert.equal(report.m2.giant_reference_hit_rate, 1 / 3);
    assert.equal(report.tasks[0].outcome, 'failure');
    assert.ok(report.tasks[0].C > 0);
});

test('twenty logged real tasks cannot prove complete five-business-day population or authorize P2', (t) => {
    const f = fixture(t);
    const tasks = Array.from({ length: 20 }, (_, index) => {
        const task = f.realTask(index);
        task.started_at = `2026-10-${String(12 + (index % 5)).padStart(2, '0')}T06:00:00Z`;
        task.reads.push(f.read(GIANT));
        return task;
    });
    const report = f.m2(tasks);
    assert.equal(report.status, 'INSUFFICIENT_EVIDENCE');
    assert.equal(report.m2.complete_population_verified, false);
    assert.equal(report.m2.phase_two_authorized, false);
    assert.equal(report.m2.giant_reference_hit_rate, 1);
});

test('M2 rejects fixed tasks, unlabeled tasks and missing reads; zero-task denominator is null', (t) => {
    const f = fixture(t);
    const fixed = f.task();
    fixed.task_kind = 'real';
    assert.equal(f.m2([fixed]).validation_status, 'FAIL');
    const real = f.realTask();
    delete real.task_kind;
    assert.equal(f.m2([real]).validation_status, 'FAIL');
    const empty = f.m2([]);
    assert.equal(empty.m2.complete_real_tasks, 0);
    assert.equal(empty.m2.average_references, null);
    assert.equal(empty.m2.status, 'INSUFFICIENT_EVIDENCE');
});

test('benefit comparison recomputes both reports and B1 nonincrease passes at equality', (t) => {
    const f = fixture(t);
    const report = f.run([f.task()]);
    const options = {
        scenarios: f.scenariosPath,
        baselineLoads: f.loadsPath,
        sourceSnapshot: f.root,
        candidateLoads: f.loadsPath,
        candidateSnapshot: f.root,
    };
    const diff = compareLoads(report, report, options);
    assert.equal(diff.status, 'PASS');
    assert.equal(diff.comparisons[0].reduction, 0);
    assert.equal(diff.phase_two_authorized, false);
    const forged = clone(report);
    forged.tasks[0].C *= 100;
    assert.throws(() => compareLoads(report, forged, options), /recomputed original/);
    const altered = clone(report);
    altered.tasks[0].bytes++;
    assert.throws(() => compareLoads(altered, report, options), /recomputed logs/);
    assert.throws(() => compareLoads(report, report, { ...options, baselineLoads: undefined }), /baseline-loads/);
    assert.throws(() => compareLoads(report, report, { ...options, sourceSnapshot: undefined }), /source-snapshot/);
    assert.throws(() => compareLoads(report, report, { ...options, scenarios: undefined }), /scenarios/);
});

test('B2 comparison uses original baseline and enforces at least forty percent reduction', (t) => {
    const f = fixture(t);
    const baselineTask = f.task('B2');
    const baselinePath = path.join(f.base, 'baseline-loads.jsonl');
    f.saveLoads([baselineTask], baselinePath);
    const baseline = aggregateLoads(baselinePath, f.root, { scenarios: f.scenariosPath });
    f.saveLoads([baselineTask]);
    const same = aggregateLoads(f.loadsPath, f.root, { scenarios: f.scenariosPath });
    const options = {
        scenarios: f.scenariosPath,
        baselineLoads: baselinePath,
        sourceSnapshot: f.root,
        candidateLoads: f.loadsPath,
        candidateSnapshot: f.root,
    };
    assert.equal(compareLoads(same, baseline, options).status, 'FAIL');
    const candidate = clone(baselineTask);
    const text = fs.readFileSync(path.join(f.root, GIANT), 'utf8');
    const firstLine = text.match(/[^\n]*\n/)[0];
    candidate.reads[1] = {
        ...candidate.reads[1],
        whole_file: false,
        fragments: [{ start_line: 1, end_line: 1, hash: sha256(firstLine) }],
        read_chars: size(firstLine).chars,
        read_bytes: size(firstLine).bytes,
    };
    f.saveLoads([candidate]);
    const reduced = aggregateLoads(f.loadsPath, f.root, { scenarios: f.scenariosPath });
    const diff = compareLoads(reduced, baseline, options);
    assert.equal(diff.status, 'PASS');
    assert.ok(diff.comparisons[0].reduction >= 0.4);
});

test('changed frozen question or protocol invalidates original evidence, even with new high denominators', (t) => {
    const f = fixture(t);
    const baseline = f.run([f.task()]);
    f.scenarios.scenarios[0].question += ' Changed.';
    f.saveScenarios();
    const current = aggregateLoads(f.loadsPath, f.root, { scenarios: f.scenariosPath });
    assert.equal(current.status, 'FAIL');
    const options = {
        scenarios: f.scenariosPath,
        baselineLoads: f.loadsPath,
        sourceSnapshot: f.root,
        candidateLoads: f.loadsPath,
        candidateSnapshot: f.root,
    };
    assert.throws(() => compareLoads(current, baseline, options), /recomputed original/);
});

test('empty comparisons and retained retries fail rather than picking the cheapest attempt', (t) => {
    const f = fixture(t);
    const unknown = f.task();
    delete unknown.scenario_id;
    let report = f.run([unknown]);
    const options = {
        scenarios: f.scenariosPath,
        baselineLoads: f.loadsPath,
        sourceSnapshot: f.root,
        candidateLoads: f.loadsPath,
        candidateSnapshot: f.root,
    };
    let diff = compareLoads(report, report, options);
    assert.equal(diff.status, 'FAIL');
    assert.match(diff.errors.join('\n'), /No valid scenario comparisons/);
    const first = f.task();
    const second = clone(first);
    second.task_id = 'task-B1-retry';
    report = f.run([first, second]);
    assert.equal(report.tasks.length, 2);
    diff = compareLoads(report, report, options);
    assert.equal(diff.status, 'FAIL');
    assert.match(diff.errors.join('\n'), /retained attempt/);
});

test('CLI rejects unknown, missing, duplicate and write/P2 flags', () => {
    for (const args of [['--unknown'], ['--loads'], ['--json', '--json'], ['--write'], ['--phase', 'P2']]) {
        const result = cli(...args);
        assert.equal(result.code, 1);
        assert.equal(result.report.status, 'FAIL');
    }
});

test('CLI static diff requires original snapshot and detects fabricated baseline fields', (t) => {
    const f = fixture(t);
    const report = measure(f.root);
    const baselinePath = path.join(f.base, 'static-baseline.json');
    fs.writeFileSync(baselinePath, JSON.stringify(report));
    let result = cli('--root', f.root, '--diff', baselinePath);
    assert.equal(result.code, 1);
    assert.match(result.report.error, /source-snapshot/);
    report.l0.chars *= 10;
    fs.writeFileSync(baselinePath, JSON.stringify(report));
    result = cli('--root', f.root, '--diff', baselinePath, '--source-snapshot', f.root);
    assert.equal(result.code, 1);
    assert.match(result.report.error, /differs from the original snapshot/);
    fs.writeFileSync(baselinePath, JSON.stringify(measure(f.root)));
    result = cli('--root', f.root, '--diff', baselinePath, '--source-snapshot', f.root);
    assert.equal(result.code, 1);
    assert.equal(result.report.diff.status, 'FAIL');
    assert.equal(result.report.diff.l0_chars_reduction, 0);
});

test('CLI load diff requires raw original logs and refuses M2 benefit comparisons', (t) => {
    const f = fixture(t);
    const report = f.run([f.task()]);
    const baselinePath = path.join(f.base, 'load-baseline.json');
    fs.writeFileSync(baselinePath, JSON.stringify(report));
    let result = cli(
        '--loads',
        f.loadsPath,
        '--snapshot',
        f.root,
        '--scenarios',
        f.scenariosPath,
        '--diff',
        baselinePath,
        '--source-snapshot',
        f.root,
    );
    assert.equal(result.code, 1);
    assert.match(result.report.error, /baseline-loads/);
    result = cli(
        '--loads',
        f.loadsPath,
        '--snapshot',
        f.root,
        '--scenarios',
        f.scenariosPath,
        '--diff',
        baselinePath,
        '--source-snapshot',
        f.root,
        '--baseline-loads',
        f.loadsPath,
    );
    assert.equal(result.code, 0, result.report.error);
    assert.equal(result.report.diff.status, 'PASS');
    f.m2([f.realTask()]);
    result = cli('--loads', f.loadsPath, '--snapshot', f.root, '--diff', baselinePath, '--baseline-loads', f.loadsPath);
    assert.equal(result.code, 1);
    assert.match(result.report.error, /scenarios/);
});

test('CLI default JSON measurement is read-only and UTF-8 files remain unchanged', (t) => {
    const f = fixture(t);
    const before = inventory(path.join(f.root, 'skills'));
    const result = cli('--root', f.root, '--json');
    assert.equal(result.code, 0);
    assert.equal(result.report.mode, 'static');
    assert.deepEqual(inventory(path.join(f.root, 'skills')), before);
});

test('static measurement is location independent even for a renamed skills directory', (t) => {
    const f = fixture(t);
    const copied = path.join(f.base, 'renamed-skills');
    fs.cpSync(path.join(f.root, 'skills'), copied, { recursive: true });
    assert.deepEqual(measure(copied), measure(f.root));
});

test('B2 reference under 15000 bytes fails even after all its source hashes are consistently changed', (t) => {
    const f = fixture(t);
    write(f.root, GIANT, '# Pipeline\n\nNames are not proof.\n');
    const manifest = snapshot(f.root);
    f.scenarios.source_snapshot_hash = manifest.snapshot_hash;
    for (const scenario of f.scenarios.scenarios) scenario.source_snapshot_hash = manifest.snapshot_hash;
    const parsed = parseMarkdown(fs.readFileSync(path.join(f.root, GIANT), 'utf8'), { path: GIANT });
    const block = parsed.blocks.find((item) => item.kind === 'prose');
    const source = { path: GIANT, block_id: block.id, hash: block.hash };
    f.scenarios.scenarios[1].source_refs = [source];
    f.scenarios.scenarios[1].completion_checks[0].sources = [source];
    f.saveScenarios();
    assert.throws(() => validateScenarios(f.scenariosPath, f.root), /at least 15 KB/);
});

test('candidate snapshot requires original source snapshot for frozen scenario validation', (t) => {
    const f = fixture(t);
    const candidateRoot = path.join(f.base, 'candidate');
    fs.cpSync(f.root, candidateRoot, { recursive: true });
    fs.appendFileSync(path.join(candidateRoot, ROUTER), '\nCandidate routing note.\n');
    snapshot(candidateRoot);
    const task = f.task('B1', candidateRoot);
    f.saveLoads([task]);
    assert.throws(
        () => aggregateLoads(f.loadsPath, candidateRoot, { scenarios: f.scenariosPath }),
        /source snapshot mismatch/,
    );
    const report = aggregateLoads(f.loadsPath, candidateRoot, { scenarios: f.scenariosPath, sourceSnapshot: f.root });
    assert.equal(report.status, 'PASS', taskErrors(report));
    assert.notEqual(report.snapshot_hash, report.source_snapshot_hash);
});

test('answer changes after baseline capture invalidate recomputation even when old report is unchanged', (t) => {
    const f = fixture(t);
    const task = f.task();
    const report = f.run([task]);
    fs.appendFileSync(path.join(f.base, task.answer_artifact), '\nChanged answer.');
    const options = {
        scenarios: f.scenariosPath,
        baselineLoads: f.loadsPath,
        sourceSnapshot: f.root,
        candidateLoads: f.loadsPath,
        candidateSnapshot: f.root,
    };
    assert.throws(() => compareLoads(report, report, options), /recomputed original/);
});

test('BOMs are preserved in text payload cost and malformed UTF-8 is rejected', (t) => {
    const f = fixture(t);
    write(f.root, 'skills/README.md', '\ufeffRead me.\n');
    const report = measure(f.root);
    const file = report.files.find((entry) => entry.path === 'skills/README.md');
    assert.equal(file.full.bytes, Buffer.byteLength('\ufeffRead me.\n'));
    assert.equal(file.full.chars, [...'\ufeffRead me.\n'].length);
    write(f.root, 'skills/README.md', Buffer.from([0xff]));
    assert.throws(() => measure(f.root), /Invalid UTF-8/);
});
