'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const route = require('../route-regression.cjs');

const serialize = (record, view) =>
    `${record.name}\n${record.description}${view === 'suite-extended' ? `\n${(record.owns || []).join(' ')}` : ''}`;

test('tokenizer pins casing, Unicode normalization, exact errors, camel case and stop words', () => {
    assert.deepEqual(route.tokenize('The ＡＩＲ_E_TEXTURE_COLOR uses targetTexture, render-target and 阴影.'), [
        'air_e_texture_color',
        'air',
        'e',
        'texture',
        'color',
        'uses',
        'targettexture',
        'target',
        'texture',
        'render',
        'target',
        '阴',
        '影',
    ]);
});

test('BM25 follows k1 1.2 b .75 and positive natural-log IDF', () => {
    const records = [
        { name: 'x', description: 'needle needle' },
        { name: 'y', description: 'other' },
    ];
    const result = route.rankRecords(records, 'needle needle', serialize, 'host-minimal');
    const idf = Math.log(1 + (2 - 1 + 0.5) / (1 + 0.5));
    const expected = (idf * 2 * 2.2) / (2 + 1.2 * (0.25 + 0.75 * (3 / 2.5)));
    assert.equal(result.ranking[0].name, 'x');
    assert.equal(result.ranking[0].score, expected);
    assert.deepEqual(result.query_tokens, ['needle']);
    assert.equal(result.ranking[0].matched_terms[0].tf, 2);
});

test('ties use deterministic ascending names and retain every competitor', () => {
    const result = route.rankRecords(
        [
            { name: 'z', description: 'none' },
            { name: 'a', description: 'none' },
        ],
        'missing',
        serialize,
        'host-minimal',
    );
    assert.deepEqual(
        result.ranking.map((entry) => entry.name),
        ['a', 'z'],
    );
    assert.deepEqual(
        result.ranking.map((entry) => entry.rank),
        [1, 2],
    );
});

test('zero-hit accidental top three is not effective recall or a boundary pass', () => {
    const result = route.evaluate(
        [
            { name: 'a', description: 'unrelated' },
            { name: 'b', description: 'other' },
        ],
        [{ id: 'p', kind: 'boundary', prompt: 'missing', gold: 'a', reject: ['b'] }],
        serialize,
        'host-minimal',
    );
    assert.equal(result.results[0].gold_rank, 1);
    assert.equal(result.results[0].effective_hit, false);
    assert.equal(result.results[0].boundary_pass, false);
    assert.equal(result.metrics.top1, 0);
    assert.equal(result.metrics.top3, 0);
});

test('field views stay separate without body fallback', () => {
    const records = [
        { name: 'a', description: 'unrelated', owns: ['needle'] },
        { name: 'b', description: 'other' },
    ];
    assert.equal(route.rankRecords(records, 'needle', serialize, 'host-minimal').ranking[0].score, 0);
    assert.ok(route.rankRecords(records, 'needle', serialize, 'suite-extended').ranking[0].score > 0);
});

test('full gate requires 38/44, 19/22 and every top-three and boundary result', () => {
    const metrics = {
        total: 44,
        top1: 38,
        top3: 44,
        effective_hits: 44,
        gold_top1: 19,
        boundary_total: 12,
        boundary_pass: 12,
    };
    assert.equal(route.absoluteGate(metrics, false).pass, true);
    for (const metric of ['top1', 'top3', 'effective_hits', 'gold_top1', 'boundary_pass']) {
        assert.equal(route.absoluteGate({ ...metrics, [metric]: metrics[metric] - 1 }, false).pass, false);
    }
});

test('probe gate takes ceil(.85 N) and preserves every effective hit', () => {
    const metrics = {
        total: 13,
        top1: 11,
        top3: 13,
        effective_hits: 13,
        gold_top1: 5,
        boundary_total: 3,
        boundary_pass: 3,
    };
    assert.equal(route.absoluteGate(metrics, true).thresholds.top1, 12);
    assert.equal(route.absoluteGate(metrics, true).pass, false);
    assert.equal(route.absoluteGate({ ...metrics, top1: 12 }, true).pass, true);
});

test('regression comparison preserves each metric independently', () => {
    const before = {
        top1: 38,
        top3: 44,
        gold_top1: 19,
        boundary_pass: 12,
        effective_hits: 44,
        real_error_top1: 8,
        real_error_top3: 10,
    };
    assert.equal(route.regressionGate(before, before).pass, true);
    assert.equal(route.regressionGate({ ...before, top1: 40, real_error_top1: 7 }, before).pass, false);
});

test('CLI rejects unsupported model tier, unknown flags and missing snapshot', () => {
    assert.throws(() => route.parseArgs(['--snapshot', 'x', '--tier', 'T2']), /Only deterministic T1/);
    assert.throws(() => route.parseArgs(['--write']), /Unknown argument/);
    assert.throws(() => route.parseArgs([]), /snapshot/);
    assert.throws(() => route.parseArgs(['--snapshot', 'x', '--snapshot', 'y']), /Duplicate argument/);
});

test('snapshot inventory is deterministic and rejects symbolic links', () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'route-regression-test-'));
    try {
        fs.writeFileSync(path.join(temporary, 'b.md'), 'b\n');
        fs.writeFileSync(path.join(temporary, 'a.md'), 'a\n');
        const first = route.inventory(temporary);
        assert.deepEqual(
            first.files.map((entry) => entry.path),
            ['skills/a.md', 'skills/b.md'],
        );
        assert.deepEqual(route.inventory(temporary), first);
        const rootLink = path.join(temporary, 'root-link');
        fs.symlinkSync(temporary, rootLink);
        assert.throws(() => route.inventory(rootLink), /real directory/);
        fs.unlinkSync(rootLink);
        fs.symlinkSync('a.md', path.join(temporary, 'c.md'));
        assert.throws(() => route.inventory(temporary), /Symbolic links/);
    } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
    }
});

test('probe selection is all-and-only frozen five owners, with both required real errors', () => {
    const fixture = {
        freeze: { prompt_payload_sha256: 'fixed' },
        prompts: [
            { id: 'render-error', kind: 'real-error', gold: 'cocosair-rendering' },
            { id: 'app-error', kind: 'real-error', gold: 'cocosair-application' },
            { id: 'another-owner', kind: 'gold', gold: 'cocosair-math' },
        ],
    };
    const probe = {
        schema: 1,
        skills: route.PROBE_SKILLS,
        prompt_payload_sha256: 'fixed',
        prompt_ids: ['render-error', 'app-error'],
        ids_sha256: route.sha256(JSON.stringify(['render-error', 'app-error'])),
    };
    assert.equal(route.selectProbe(probe, fixture).length, 2);
    assert.throws(() => route.selectProbe({ ...probe, prompt_ids: ['render-error'] }, fixture), /every prompt/);
    assert.throws(() => route.selectProbe({ ...probe, skills: ['cocosair-rendering'] }, fixture), /five fixed skills/);
});

test('a self-consistent but fabricated baseline score is rejected against original recomputation', () => {
    const records = Array.from({ length: 22 }, (_, index) => ({
        name: `skill-${String(index).padStart(2, '0')}`,
        description: index === 0 ? 'needle' : 'unrelated',
    }));
    const prompts = [{ id: 'fixed', kind: 'gold', prompt: 'needle', gold: records[0].name }];
    const original = route.evaluate(records, prompts, serialize, 'host-minimal');
    const metadata = {
        source_snapshot_hash: 'snapshot',
        source_tree_hash: 'original-tree',
        candidate_tree_hash: 'original-tree',
        parameters: route.PARAMETERS,
    };
    const baseline = {
        schema: 1,
        tier: 'T1',
        mode: 'baseline-capture',
        metadata,
        views: { 'host-minimal': structuredClone(original) },
    };
    assert.equal(
        route.validateBaseline(baseline, metadata, prompts, records, 'host-minimal', original).metrics.top1,
        1,
    );
    const forged = baseline.views['host-minimal'].results[0];
    forged.ranking[0].score += 100;
    forged.gold_score = forged.ranking[0].score;
    assert.throws(
        () => route.validateBaseline(baseline, metadata, prompts, records, 'host-minimal', original),
        /differ from frozen original recomputation/,
    );
});

const parser = require('../lib/md-parse.cjs');
const indexModule = require('../gen-index.cjs');

function writeLogical(root, logical, contents) {
    const filename = path.join(root, logical);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, contents);
}

function freezeSynthetic(root) {
    const files = route.inventory(path.join(root, 'skills')).files;
    const manifest = { schema: 1, files, snapshot_hash: route.sha256(JSON.stringify(files)) };
    fs.writeFileSync(path.join(root, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
    return route.loadSnapshot(root);
}

function prerequisiteCase(t) {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'route-prerequisite-test-'));
    t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
    const originalRoot = path.join(temporary, 'original');
    const prerequisiteRoot = path.join(temporary, 'prerequisite');
    const names = [
        ...route.PROBE_SKILLS,
        'cocosair',
        'cocosair-verification',
        'cocosair-graphics-and-dom',
        ...Array.from({ length: 14 }, (_, index) => `cocosair-synthetic-${index}`),
    ];
    for (const name of names) {
        writeLogical(
            originalRoot,
            `skills/${name}/SKILL.md`,
            `---\nname: ${name}\ndescription: Synthetic original metadata.\n---\n\n# Synthetic owner\n\nUnchanged body.\n`,
        );
    }
    writeLogical(originalRoot, 'skills/cocosair/references/unchanged.md', 'Unchanged reference.\n');
    for (const spec of route.PREREQUISITE_CHANGES) {
        const text = spec.path.endsWith('/gate-catalog.md')
            ? `# Synthetic gate\n\n| Command | Output |\n| --- | --- |\n| one | ${spec.from} under \`build/reports/\` |\n| two | \`a  b\` |\n\nRetain this prose.\n`
            : `# Synthetic reference\n\nUse ${spec.from} under the original output contract.\n\nKeep all qualifiers.\n`;
        writeLogical(originalRoot, spec.path, text);
    }
    const original = freezeSynthetic(originalRoot);
    fs.cpSync(originalRoot, prerequisiteRoot, { recursive: true });
    for (const spec of route.PREREQUISITE_CHANGES) {
        const old = fs.readFileSync(path.join(originalRoot, spec.path), 'utf8');
        writeLogical(prerequisiteRoot, spec.path, old.replace(spec.from, spec.to));
    }
    // All skill metadata, prompts and original references are synthetic. This
    // one task-specific approved byte artifact is copied solely for the fixed
    // prerequisite integrity gate; its contents never enter scoring fields.
    const approvedExcerpt = fs.readFileSync(path.resolve(__dirname, '../../..', route.PREREQUISITE_ADDED.path));
    assert.equal(route.sha256(approvedExcerpt), route.PREREQUISITE_ADDED.sha256);
    assert.equal(approvedExcerpt.length, route.PREREQUISITE_ADDED.bytes);
    writeLogical(prerequisiteRoot, route.PREREQUISITE_ADDED.path, approvedExcerpt);
    const state = { temporary, originalRoot, prerequisiteRoot, original };
    state.refresh = () => {
        state.prerequisite = freezeSynthetic(prerequisiteRoot);
        const lookup = (snapshot, logical) => snapshot.actual.files.find((entry) => entry.path === logical);
        state.proof = {
            schema: 1,
            kind: 'approved-skills-path-prerequisite',
            original_snapshot_hash: state.original.hash,
            prerequisite_snapshot_hash: state.prerequisite.hash,
            approval: { ...route.PREREQUISITE_APPROVAL },
            changes: route.PREREQUISITE_CHANGES.map((spec) => ({
                ...spec,
                before_sha256: lookup(state.original, spec.path).sha256,
                after_sha256: lookup(state.prerequisite, spec.path)?.sha256,
            })),
            added: [
                {
                    ...route.PREREQUISITE_ADDED,
                    sha256: lookup(state.prerequisite, route.PREREQUISITE_ADDED.path)?.sha256,
                    bytes: lookup(state.prerequisite, route.PREREQUISITE_ADDED.path)?.bytes,
                },
            ],
            review: {
                status: 'approved',
                reviewer: 'Synthetic test reviewer',
                notes: 'Synthetic content review only.',
            },
        };
    };
    state.check = (proof = state.proof, projection = indexModule) =>
        route.validatePrerequisiteSnapshot(state.original, state.prerequisite, proof, parser.parseMarkdown, projection);
    state.edit = (logical, transform) => {
        const filename = path.join(prerequisiteRoot, logical);
        fs.writeFileSync(filename, transform(fs.readFileSync(filename, 'utf8')));
        state.refresh();
    };
    state.refresh();
    return state;
}

test('prerequisite CLI flags must be paired and probe-only, including programmatic calls', () => {
    const base = ['--snapshot', 'original'];
    for (const flags of [
        ['--probe', 'ids', '--probe-base', 'base'],
        ['--probe', 'ids', '--prerequisite-proof', 'proof'],
        ['--probe-base', 'base', '--prerequisite-proof', 'proof'],
    ])
        assert.throws(() => route.parseArgs([...base, ...flags]), /supplied together|require --probe/);
    assert.throws(() => route.run({ 'probe-base': 'base' }), /supplied together/);
    assert.throws(() => route.run({ 'probe-base': 'base', 'prerequisite-proof': 'proof' }), /require --probe/);
    const options = route.parseArgs([
        ...base,
        '--probe',
        'ids',
        '--probe-base',
        'base',
        '--prerequisite-proof',
        'proof',
    ]);
    assert.equal(options.snapshot, 'original');
    assert.equal(options['probe-base'], 'base');
    assert.equal(options['prerequisite-proof'], 'proof');
    assert.equal(route.parseArgs(base)['probe-base'], null);
});

test('approved prerequisite accepts only the bounded 4+1 diff and table padding', (t) => {
    const state = prerequisiteCase(t);
    state.edit('skills/cocosair-verification/references/gate-catalog.md', (text) =>
        text
            .replace('| Command | Output |', '| Command       | Output                                  |')
            .replace('| --- | --- |', '| ------------- | --------------------------------------- |')
            .replace('| two | `a  b` |', '| two           | `a  b`                                  |'),
    );
    const contract = state.check();
    assert.equal(contract.original_snapshot_hash, state.original.hash);
    assert.equal(contract.prerequisite_snapshot_hash, state.prerequisite.hash);
    assert.equal(contract.changed_paths.length, 4);
    assert.deepEqual(contract.added_paths, [route.PREREQUISITE_ADDED.path]);
    assert.equal(contract.original_skill_bytes_unchanged, true);
    assert.equal(contract.original_routing_projection_unchanged, true);
});

test('prerequisite rejects forged hashes, provenance, approval and proof path sets', (t) => {
    const state = prerequisiteCase(t);
    const changes = [
        [
            'original hash',
            (proof) => {
                proof.original_snapshot_hash = '0'.repeat(64);
            },
        ],
        [
            'prerequisite hash',
            (proof) => {
                proof.prerequisite_snapshot_hash = '0'.repeat(64);
            },
        ],
        [
            'before hash',
            (proof) => {
                proof.changes[0].before_sha256 = '0'.repeat(64);
            },
        ],
        [
            'after hash',
            (proof) => {
                proof.changes[0].after_sha256 = '0'.repeat(64);
            },
        ],
        [
            'added hash',
            (proof) => {
                proof.added[0].sha256 = '0'.repeat(64);
            },
        ],
        [
            'added bytes',
            (proof) => {
                proof.added[0].bytes++;
            },
        ],
        [
            'source hash',
            (proof) => {
                proof.added[0].source_sha256 = '0'.repeat(64);
            },
        ],
        [
            'source commit',
            (proof) => {
                proof.added[0].source_commit = '0'.repeat(40);
            },
        ],
        [
            'source path',
            (proof) => {
                proof.added[0].source_path = 'docs/another.md';
            },
        ],
        [
            'approval status',
            (proof) => {
                proof.approval.status = 'pending';
            },
        ],
        [
            'approval time',
            (proof) => {
                proof.approval.approved_at = '2026-10-18T06:51:18Z';
            },
        ],
        [
            'approval scope',
            (proof) => {
                proof.approval.scope += ' and arbitrary rewrites';
            },
        ],
        [
            'review status',
            (proof) => {
                proof.review.status = 'pending';
            },
        ],
        [
            'review notes',
            (proof) => {
                proof.review.notes = [];
            },
        ],
        [
            'review author',
            (proof) => {
                proof.review.reviewer = '';
            },
        ],
        [
            'missing change',
            (proof) => {
                proof.changes.pop();
            },
        ],
        [
            'duplicate change',
            (proof) => {
                proof.changes[0] = proof.changes[1];
            },
        ],
        [
            'fifth change',
            (proof) => {
                proof.changes.push({ path: 'skills/cocosair/SKILL.md' });
            },
        ],
        [
            'extra addition',
            (proof) => {
                proof.added.push({ path: 'skills/extra.md' });
            },
        ],
        [
            'different addition',
            (proof) => {
                proof.added[0].path = 'skills/extra.md';
            },
        ],
        [
            'replacement token',
            (proof) => {
                proof.changes[0].from = 'v06-final-gate.md';
            },
        ],
        [
            'replacement target',
            (proof) => {
                proof.changes[0].to = '`another.md`';
            },
        ],
    ];
    for (const [label, mutate] of changes) {
        const proof = structuredClone(state.proof);
        mutate(proof);
        assert.throws(() => state.check(proof), undefined, label);
    }
});

test('prerequisite snapshots are reread against their frozen manifests before use', (t) => {
    const state = prerequisiteCase(t);
    const target = path.join(state.prerequisiteRoot, route.PREREQUISITE_ADDED.path);
    fs.appendFileSync(target, 'Unrecorded content.\n');
    assert.throws(() => route.loadSnapshot(state.prerequisiteRoot), /Snapshot bytes changed/);
    const args = route.parseArgs([
        '--snapshot',
        state.originalRoot,
        '--probe',
        'unused-ids',
        '--probe-base',
        state.prerequisiteRoot,
        '--prerequisite-proof',
        'unused-proof',
    ]);
    assert.throws(() => route.run(args), /Snapshot bytes changed/);
    state.refresh();
    const manifestPath = path.join(state.prerequisiteRoot, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.snapshot_hash = '0'.repeat(64);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(() => route.loadSnapshot(state.prerequisiteRoot), /inventory hash mismatch/);
});

test('rewriting the approved excerpt and synchronously rehashing its proof cannot authorize different content', (t) => {
    const state = prerequisiteCase(t);
    state.edit(route.PREREQUISITE_ADDED.path, (text) => `${text}Unreviewed new content.\n`);
    assert.equal(
        state.proof.added[0].sha256,
        route.sha256(fs.readFileSync(path.join(state.prerequisiteRoot, route.PREREQUISITE_ADDED.path))),
    );
    assert.throws(() => state.check(), /added-file provenance mismatch: sha256/);
});

test('prerequisite rejects fifth file rewrite, extra addition, deletion and SKILL changes even with rehashed proof', async (t) => {
    const cases = [
        ['fifth old file', (state) => state.edit('skills/cocosair/references/unchanged.md', () => 'Changed.\n')],
        [
            'extra new file',
            (state) => {
                writeLogical(state.prerequisiteRoot, 'skills/cocosair/references/extra.md', 'Extra.\n');
                state.refresh();
            },
        ],
        [
            'deleted old file',
            (state) => {
                fs.unlinkSync(path.join(state.prerequisiteRoot, 'skills/cocosair/references/unchanged.md'));
                state.refresh();
            },
        ],
        [
            'probe metadata',
            (state) =>
                state.edit('skills/cocosair-rendering/SKILL.md', (text) =>
                    text.replace('original metadata', 'changed metadata'),
                ),
        ],
        [
            'non-probe metadata',
            (state) =>
                state.edit('skills/cocosair/SKILL.md', (text) => text.replace('original metadata', 'changed metadata')),
        ],
        [
            'body without routing change',
            (state) => state.edit('skills/cocosair/SKILL.md', (text) => `${text}\nExtra body.\n`),
        ],
    ];
    for (const [label, change] of cases)
        await t.test(label, (child) => {
            const state = prerequisiteCase(child);
            change(state);
            assert.throws(() => state.check(), /actual diff|removed an original file/);
        });
});

test('approved paths reject prose, qualifiers, blank lines, code spacing and row changes beyond exact replacements', async (t) => {
    const prose = 'skills/cocosair-verification/references/contracts.md';
    const table = 'skills/cocosair-verification/references/gate-catalog.md';
    const cases = [
        ['prose rewrite', prose, (text) => text.replace('Keep all qualifiers.', 'Different facts.')],
        ['lost under note', prose, (text) => text.replace(' under the original output contract', '')],
        ['new non-table whitespace', prose, (text) => text.replace('\n\nKeep', '\n\n\nKeep')],
        [
            'replacement absent',
            prose,
            (text) => text.replace('`build/reports/v06-final-gate.md`', '`v06-final-gate.md`'),
        ],
        ['replacement duplicated', prose, (text) => `${text}\n\`build/reports/v06-final-gate.md\`\n`],
        ['inline-code spaces', table, (text) => text.replace('`a  b`', '`a b`')],
        ['table prose spaces', table, (text) => text.replace(' under ', '  under ')],
        ['table alignment semantics', table, (text) => text.replace('| --- | --- |', '| :--- | --- |')],
        [
            'table row duplicate',
            table,
            (text) => text.replace('| two | `a  b` |', '| two | `a  b` |\n| two | `a  b` |'),
        ],
        ['table row reordered', table, (text) => text.replace(/(\| one[^\n]+\n)(\| two[^\n]+\n)/, '$2$1')],
        [
            'graphics link target',
            'skills/cocosair-graphics-and-dom/references/commands.md',
            (text) => text.replace('(verification-commands.md)', '(other.md)'),
        ],
    ];
    for (const [label, logical, transform] of cases)
        await t.test(label, (child) => {
            const state = prerequisiteCase(child);
            state.edit(logical, transform);
            assert.throws(() => state.check(), /exact replacement|actual diff/);
        });
});

test('each original approved replacement must occur exactly once', (t) => {
    const state = prerequisiteCase(t);
    const spec = route.PREREQUISITE_CHANGES[0];
    fs.appendFileSync(path.join(state.originalRoot, spec.path), `\nSecond ${spec.from}.\n`);
    fs.appendFileSync(path.join(state.prerequisiteRoot, spec.path), `\nSecond ${spec.to}.\n`);
    state.original = freezeSynthetic(state.originalRoot);
    state.refresh();
    assert.throws(() => state.check(), /exactly once/);
});

test('prerequisite requires equality of the shared routing projections', (t) => {
    const state = prerequisiteCase(t);
    const tamperedProjection = {
        ...indexModule,
        loadRoutingRecords(root) {
            const records = indexModule.loadRoutingRecords(root);
            if (root === state.prerequisite.root) records[0].description = 'Different projection';
            return records;
        },
    };
    assert.throws(() => state.check(state.proof, tamperedProjection), /routing projection/);
});

test('candidate probe still freezes all prerequisite references, competitors and bodies', (t) => {
    const state = prerequisiteCase(t);
    state.check();
    const candidate = path.join(state.temporary, 'candidate');
    fs.cpSync(state.prerequisite.root, candidate, { recursive: true });
    const skill = path.join(candidate, 'cocosair-rendering', 'SKILL.md');
    fs.writeFileSync(skill, fs.readFileSync(skill, 'utf8').replace('original metadata', 'candidate metadata'));
    const check = (base = state.prerequisite) =>
        route.validateProbeCorpus(base, candidate, route.inventory(candidate), parser.parseMarkdown);
    assert.equal(check().metadata_only, true);
    assert.throws(() => check(state.original), /frozen competitor or reference/);
    const excerpt = path.join(candidate, route.PREREQUISITE_ADDED.path.slice('skills/'.length));
    fs.appendFileSync(excerpt, 'Post-prerequisite edit.\n');
    assert.throws(check, /frozen competitor or reference/);
    fs.copyFileSync(path.join(state.prerequisite.root, route.PREREQUISITE_ADDED.path.slice('skills/'.length)), excerpt);
    fs.appendFileSync(skill, 'Body change.\n');
    assert.throws(check, /metadata edits only/);
});

test('synthetic end-to-end probe keeps original prompt evidence and baseline while reporting prerequisite hashes', (t) => {
    const state = prerequisiteCase(t);
    const names = indexModule.loadRoutingRecords(state.original.root).map((record) => record.name);
    const cite = (logical, blockIndex) => {
        const text = fs.readFileSync(path.join(state.originalRoot, logical), 'utf8');
        const block = parser.parseMarkdown(text).blocks[blockIndex];
        return { path: logical, block_id: block.id, hash: block.hash };
    };
    const reason =
        'Synthetic ownership assigned solely for testing the complete proof-chain wiring and original source binding.';
    const prompts = names.map((name, index) => ({
        id: `synthetic-gold-${index}`,
        kind: 'gold',
        gold: name,
        prompt: `Synthetic original metadata question for ${name}, with sufficient context.`,
        source_skill: name,
        sources: [cite(`skills/${name}/SKILL.md`, 0)],
        ownership_reason: reason,
    }));
    const competitors = names.filter((name) => !route.PROBE_SKILLS.includes(name));
    for (let index = 0; index < 12; index++) {
        const gold = route.PROBE_SKILLS[index % route.PROBE_SKILLS.length];
        prompts.push({
            id: `synthetic-boundary-${index}`,
            kind: 'boundary',
            gold,
            reject: [competitors[index]],
            prompt: `Synthetic metadata boundary for ${gold}, preserving an unambiguous test label.`,
            source_skill: gold,
            sources: [cite(`skills/${gold}/SKILL.md`, 0)],
            ownership_reason: reason,
        });
    }
    // This deliberately cites a changed prerequisite reference. Using the
    // prerequisite as the fixture source would fail its frozen original hash.
    for (let index = 0; index < 10; index++)
        prompts.push({
            id: `synthetic-error-${index}`,
            kind: 'real-error',
            gold: route.PROBE_SKILLS[index % route.PROBE_SKILLS.length],
            prompt: 'Synthetic diagnostic `v06-final-gate.md` has explicit original metadata context.',
            exact_error: '`v06-final-gate.md`',
            source_skill: 'cocosair-verification',
            sources: [cite('skills/cocosair-verification/references/contracts.md', 1)],
            ownership_reason: reason,
        });
    const fixture = {
        schema: 1,
        freeze: {
            reviewed_before_scoring: true,
            source_snapshot_hash: state.original.hash,
            prompt_payload_sha256: route.sha256(JSON.stringify(prompts)),
        },
        prompts,
    };
    const promptPath = path.join(state.temporary, 'synthetic-prompts.json');
    fs.writeFileSync(promptPath, JSON.stringify(fixture));
    const probeIds = prompts.filter((prompt) => route.PROBE_SKILLS.includes(prompt.gold)).map((prompt) => prompt.id);
    const probePath = path.join(state.temporary, 'synthetic-probe.json');
    fs.writeFileSync(
        probePath,
        JSON.stringify({
            schema: 1,
            skills: route.PROBE_SKILLS,
            source_snapshot_hash: state.original.hash,
            prompt_payload_sha256: fixture.freeze.prompt_payload_sha256,
            prompt_ids: probeIds,
            ids_sha256: route.sha256(JSON.stringify(probeIds)),
        }),
    );
    const baseline = route.run(route.parseArgs(['--snapshot', state.originalRoot, '--prompts', promptPath]));
    assert.equal(baseline.mode, 'baseline-capture');
    assert.equal(baseline.metadata.source_snapshot_hash, state.original.hash);
    assert.equal(Object.hasOwn(baseline, 'prerequisite_corpus_contract'), false);
    const baselinePath = path.join(state.temporary, 'synthetic-baseline.json');
    fs.writeFileSync(baselinePath, JSON.stringify(baseline));
    const proofPath = path.join(state.temporary, 'synthetic-proof.json');
    fs.writeFileSync(proofPath, JSON.stringify(state.proof));
    const report = route.run(
        route.parseArgs([
            '--snapshot',
            state.originalRoot,
            '--root',
            state.prerequisiteRoot,
            '--prompts',
            promptPath,
            '--baseline',
            baselinePath,
            '--probe',
            probePath,
            '--probe-base',
            state.prerequisiteRoot,
            '--prerequisite-proof',
            proofPath,
        ]),
    );
    assert.equal(report.mode, 'candidate-gate');
    assert.equal(report.competitor_count, 22);
    assert.equal(report.metadata.source_snapshot_hash, state.original.hash);
    assert.equal(report.metadata.source_tree_hash, state.original.actual.hash);
    assert.equal(report.metadata.original_snapshot_hash, state.original.hash);
    assert.equal(report.metadata.prerequisite_snapshot_hash, state.prerequisite.hash);
    assert.equal(report.metadata.prerequisite_proof_hash, route.sha256(fs.readFileSync(proofPath)));
    assert.equal(report.metadata.baseline_report_hash, route.sha256(fs.readFileSync(baselinePath)));
    assert.deepEqual(report.source_manifest, state.original.manifest.files);
    assert.deepEqual(report.candidate_manifest, state.prerequisite.actual.files);
    for (const view of route.VIEWS) {
        const originalResults = baseline.views[view].results.filter((result) => probeIds.includes(result.id));
        assert.deepEqual(report.views[view].results, originalResults);
        assert.deepEqual(report.views[view].baseline_metrics, route.summarize(originalResults));
    }
});
