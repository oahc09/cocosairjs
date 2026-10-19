#!/usr/bin/env node
'use strict';

/**
 * Deterministic stage-one lexical routing regression. Read-only; JSON on stdout.
 *
 * Baseline: --snapshot <frozen-dir> [--prompts <fixture>]
 * Candidate: --snapshot <frozen-dir> --root <candidate-skills> --baseline <report>
 * Optional: --tier T1 --view both|host-minimal|suite-extended --probe <ids-json>
 * Approved prerequisite chain (probe only): --probe-base <frozen-dir>
 * --prerequisite-proof <json>. The original --snapshot remains the sole prompt
 * source and scoring baseline; the prerequisite only bounds filesystem edits.
 * A baseline capture records absolute-threshold failures without pretending the
 * original corpus is a passing candidate. Candidate gates require a baseline.
 *
 * Tokenization is deliberately pinned before scoring: NFKC normalization;
 * Unicode letters/numbers and underscore identifiers; lowercase; preserve each
 * whole identifier, then add its distinct underscore/camel-case components;
 * punctuation and hyphens delimit words; no stemming or synonyms; one token per
 * Han character; remove only the fixed English stop words below. The full error
 * identifier is retained alongside its components, not replaced by a wildcard.
 * Repeated document terms count; query terms are unique. BM25 uses natural-log
 * positive IDF log(1 + (N - df + 0.5)/(df + 0.5)), k1=1.2, b=0.75.
 * Scores sort descending, with bytewise skill-name order for exact ties.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REPORT_SCHEMA = 1;
const TOKENIZER_VERSION = 'air-route-tokenizer-v1';
const SCORER_VERSION = 'air-bm25-v1';
const FIXTURE_SCHEMA = 1;
const PARAMETERS = Object.freeze({ k1: 1.2, b: 0.75 });
const VIEWS = Object.freeze(['host-minimal', 'suite-extended']);
const PROBE_SKILLS = Object.freeze([
    'cocosair-application',
    'cocosair-gltf',
    'cocosair-materials-effects',
    'cocosair-project-setup',
    'cocosair-rendering',
]);
const PREREQUISITE_CHANGES = Object.freeze([
    ...['contracts', 'gate-catalog'].map((name) =>
        Object.freeze({
            path: `skills/cocosair-verification/references/${name}.md`,
            from: '`v06-final-gate.md`',
            to: '`build/reports/v06-final-gate.md`',
        }),
    ),
    ...['commands', 'sprite-mask'].map((name) =>
        Object.freeze({
            path: `skills/cocosair-graphics-and-dom/references/${name}.md`,
            from: '[docs/manual/graphics-and-dom.md](../../../docs/manual/graphics-and-dom.md)',
            to: '[verification commands](verification-commands.md)',
        }),
    ),
]);
const PREREQUISITE_ADDED = Object.freeze({
    path: 'skills/cocosair-graphics-and-dom/references/verification-commands.md',
    // Task-specific approved, formatted excerpt. A rewritten proof cannot
    // authorize different content even when its self-reported hashes agree.
    sha256: '282264335afb0903ddbbea81fbfb17d0a9c8dc6a5e750f9f55ae4aaaabc20509',
    bytes: 5526,
    source_commit: '66d11fd0c3c189b7dfa6d20645222e237352f9f3',
    source_path: 'docs/manual/graphics-and-dom.md',
    source_sha256: '6ef7f792631034eb9150a966ab28024ee1cf6bf62e9a5d34d95d61051b82d3fb',
});
const PREREQUISITE_APPROVAL = Object.freeze({
    status: 'approved',
    approved_at: '2026-10-18T06:51:17Z',
    scope: 'four navigation/output references and skill-local verification excerpt',
});
const STOP_WORDS = Object.freeze(
    'a an and are as at be been being but by can could did do does for from had has have how i if in into is it its me my of on or our should so than that the their them then there these they this those to was we were what when where which while who why will with would you your'.split(
        ' ',
    ),
);
const STOP_SET = new Set(STOP_WORDS);
const TOKENIZER_CONFIG = Object.freeze({
    version: TOKENIZER_VERSION,
    normalization: 'NFKC',
    lexeme: '[\\p{L}\\p{N}_]+',
    han: 'individual Unicode Han code points',
    identifier: 'whole lowercase plus distinct underscore/camel-case parts; no same-lexeme duplicates',
    stop_words: STOP_WORDS,
    stemming: false,
    query_frequency: 'unique terms',
    tie_break: 'ascending JavaScript code-unit name order',
});

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function compareNames(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function tokenize(value) {
    const text = String(value)
        .normalize('NFKC')
        .replace(/(\p{Script=Han})/gu, ' $1 ');
    const output = [];
    for (const lexeme of text.match(/[\p{L}\p{N}_]+/gu) || []) {
        const full = lexeme.toLowerCase();
        const parts = lexeme
            .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
            .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
            .split(/[_\s]+/u)
            .map((part) => part.toLowerCase());
        for (const token of new Set([full, ...parts])) {
            if (token && !/^_+$/u.test(token) && !STOP_SET.has(token)) output.push(token);
        }
    }
    return output;
}

function rankRecords(records, prompt, serialize, view) {
    assert(records.length > 0, 'Cannot rank an empty corpus');
    const queryTokens = [...new Set(tokenize(prompt))];
    const docs = records.map((record) => {
        const text = serialize(record, view);
        assert(typeof text === 'string', 'Shared routing serializer must return a string');
        const tokens = tokenize(text);
        const frequencies = new Map();
        for (const token of tokens) frequencies.set(token, (frequencies.get(token) || 0) + 1);
        return { name: record.name, length: tokens.length, frequencies, text_hash: sha256(text) };
    });
    const averageLength = docs.reduce((total, doc) => total + doc.length, 0) / docs.length;
    const df = new Map(queryTokens.map((token) => [token, docs.filter((doc) => doc.frequencies.has(token)).length]));
    const ranking = docs.map((doc) => {
        const matchedTerms = [];
        let score = 0;
        for (const token of queryTokens) {
            const tf = doc.frequencies.get(token) || 0;
            if (!tf) continue;
            const frequency = df.get(token);
            const idf = Math.log(1 + (docs.length - frequency + 0.5) / (frequency + 0.5));
            const contribution =
                (idf * tf * (PARAMETERS.k1 + 1)) /
                (tf + PARAMETERS.k1 * (1 - PARAMETERS.b + PARAMETERS.b * (doc.length / (averageLength || 1))));
            score += contribution;
            matchedTerms.push({ term: token, tf, df: frequency, idf, contribution });
        }
        return {
            name: doc.name,
            score,
            document_tokens: doc.length,
            document_hash: doc.text_hash,
            matched_terms: matchedTerms,
        };
    });
    ranking.sort((a, b) => b.score - a.score || compareNames(a.name, b.name));
    ranking.forEach((result, index) => (result.rank = index + 1));
    return { query_tokens: queryTokens, average_document_tokens: averageLength, ranking };
}

function summarize(results) {
    const gold = results.filter((result) => result.kind === 'gold');
    const boundaries = results.filter((result) => result.kind === 'boundary');
    const errors = results.filter((result) => result.kind === 'real-error');
    return {
        total: results.length,
        top1: results.filter((result) => result.gold_rank === 1 && result.effective_hit).length,
        top3: results.filter((result) => result.gold_rank <= 3 && result.effective_hit).length,
        effective_hits: results.filter((result) => result.effective_hit).length,
        gold_total: gold.length,
        gold_top1: gold.filter((result) => result.gold_rank === 1 && result.effective_hit).length,
        boundary_total: boundaries.length,
        boundary_pass: boundaries.filter((result) => result.boundary_pass).length,
        real_error_total: errors.length,
        real_error_top1: errors.filter((result) => result.gold_rank === 1 && result.effective_hit).length,
        real_error_top3: errors.filter((result) => result.gold_rank <= 3 && result.effective_hit).length,
    };
}

function evaluate(records, prompts, serialize, view) {
    const results = prompts.map((prompt) => {
        const scored = rankRecords(records, prompt.prompt, serialize, view);
        const gold = scored.ranking.find((entry) => entry.name === prompt.gold);
        assert(gold, `Unknown gold for ${prompt.id}: ${prompt.gold}`);
        const rejects = (prompt.reject || []).map((name) => ({
            name,
            rank: scored.ranking.find((entry) => entry.name === name).rank,
        }));
        const effectiveHit = gold.matched_terms.length > 0 && gold.score > 0;
        return {
            id: prompt.id,
            kind: prompt.kind,
            prompt: prompt.prompt,
            gold: prompt.gold,
            gold_rank: gold.rank,
            gold_score: gold.score,
            effective_hit: effectiveHit,
            gold_matched_terms: gold.matched_terms.map((entry) => entry.term),
            exact_error: prompt.exact_error || null,
            exact_error_tokens: prompt.exact_error ? tokenize(prompt.exact_error) : [],
            matched_error_tokens: prompt.exact_error
                ? tokenize(prompt.exact_error).filter((token) =>
                      gold.matched_terms.some((entry) => entry.term === token),
                  )
                : [],
            rejects,
            boundary_pass: effectiveHit && rejects.every((entry) => gold.rank < entry.rank),
            ...scored,
        };
    });
    return { metrics: summarize(results), results };
}

function absoluteGate(metrics, probe) {
    const thresholds = {
        top1: probe ? Math.ceil(0.85 * metrics.total) : 38,
        top3: metrics.total,
        effective_hits: metrics.total,
        gold_top1: probe ? null : 19,
        boundary_pass: metrics.boundary_total,
    };
    const checks = Object.entries(thresholds)
        .filter(([, minimum]) => minimum !== null)
        .map(([metric, minimum]) => ({ metric, actual: metrics[metric], minimum, pass: metrics[metric] >= minimum }));
    return { pass: checks.every((check) => check.pass), thresholds, checks };
}

function regressionGate(metrics, original) {
    const names = [
        'top1',
        'top3',
        'gold_top1',
        'boundary_pass',
        'effective_hits',
        'real_error_top1',
        'real_error_top3',
    ];
    const checks = names.map((metric) => ({
        metric,
        baseline: original[metric],
        candidate: metrics[metric],
        delta: metrics[metric] - original[metric],
        pass: metrics[metric] >= original[metric],
    }));
    return { pass: checks.every((check) => check.pass), checks };
}

function readJson(filename) {
    return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function resolveSkillsRoot(root) {
    const absolute = path.resolve(root);
    const nested = path.join(absolute, 'skills');
    return fs.existsSync(path.join(nested, 'cocosair', 'SKILL.md')) ? nested : absolute;
}

function inventory(root) {
    const rootStat = fs.lstatSync(root);
    assert(rootStat.isDirectory() && !rootStat.isSymbolicLink(), 'Routing snapshot root must be a real directory');
    const files = [];
    function visit(directory) {
        for (const name of fs.readdirSync(directory).sort(compareNames)) {
            const filename = path.join(directory, name);
            const stat = fs.lstatSync(filename);
            assert(!stat.isSymbolicLink(), `Symbolic links are not accepted in a routing snapshot: ${name}`);
            if (stat.isDirectory()) visit(filename);
            else {
                assert(stat.isFile(), `Unsupported snapshot entry: ${name}`);
                const bytes = fs.readFileSync(filename);
                files.push({
                    path: `skills/${path.relative(root, filename).split(path.sep).join('/')}`,
                    bytes: bytes.length,
                    sha256: sha256(bytes),
                });
            }
        }
    }
    visit(root);
    files.sort((a, b) => compareNames(a.path, b.path));
    return { files, hash: sha256(JSON.stringify(files)) };
}

function safeSourcePath(root, logicalPath) {
    assert(typeof logicalPath === 'string' && logicalPath.startsWith('skills/'), `Invalid source path: ${logicalPath}`);
    assert(!logicalPath.includes('\\') && !logicalPath.split('/').includes('..'), `Unsafe source path: ${logicalPath}`);
    const filename = path.resolve(root, logicalPath.slice('skills/'.length));
    assert(filename.startsWith(`${root}${path.sep}`), `Source escapes snapshot: ${logicalPath}`);
    return filename;
}

function validateFixture(fixture, names, snapshotRoot, parseMarkdown) {
    assert(fixture.schema === FIXTURE_SCHEMA, 'Unsupported prompt fixture schema');
    assert(
        fixture.freeze?.reviewed_before_scoring === true,
        'Prompt ownership must be reviewed and frozen before scoring',
    );
    assert(Array.isArray(fixture.prompts) && fixture.prompts.length === 44, 'Fixture must contain exactly 44 prompts');
    assert(
        fixture.freeze.prompt_payload_sha256 === sha256(JSON.stringify(fixture.prompts)),
        'Frozen prompt payload hash mismatch',
    );
    const ids = new Set();
    const known = new Set(names);
    const goldOwners = [];
    const pairs = new Set();
    const counts = { gold: 0, boundary: 0, 'real-error': 0 };
    const parsed = new Map();
    for (const prompt of fixture.prompts) {
        assert(typeof prompt.id === 'string' && !ids.has(prompt.id), `Duplicate or invalid prompt id: ${prompt.id}`);
        ids.add(prompt.id);
        assert(Object.hasOwn(counts, prompt.kind), `Invalid prompt kind: ${prompt.id}`);
        counts[prompt.kind] += 1;
        assert(known.has(prompt.gold), `Unknown owner: ${prompt.id}`);
        assert(known.has(prompt.source_skill), `Unknown source skill: ${prompt.id}`);
        assert(
            typeof prompt.prompt === 'string' && prompt.prompt.trim().length >= 30,
            `Insufficient prompt context: ${prompt.id}`,
        );
        assert(
            typeof prompt.ownership_reason === 'string' && prompt.ownership_reason.length >= 60,
            `Missing substantive ownership audit: ${prompt.id}`,
        );
        assert(Array.isArray(prompt.sources) && prompt.sources.length > 0, `Missing source evidence: ${prompt.id}`);
        const sourceTexts = [];
        for (const source of prompt.sources) {
            const filename = safeSourcePath(snapshotRoot, source.path);
            if (!parsed.has(filename))
                parsed.set(filename, parseMarkdown(fs.readFileSync(filename, 'utf8'), { path: source.path }));
            const block = parsed.get(filename).blocks.find((entry) => entry.id === source.block_id);
            assert(block, `Unknown source block ${source.path}#${source.block_id}`);
            assert(
                block.hash === source.hash,
                `Source block hash mismatch: ${prompt.id} ${source.path}#${source.block_id}`,
            );
            sourceTexts.push(block.text);
        }
        assert(
            prompt.sources.some((source) => source.path.startsWith(`skills/${prompt.source_skill}/`)),
            `Source skill has no cited source: ${prompt.id}`,
        );
        if (prompt.kind === 'gold') goldOwners.push(prompt.gold);
        const rejects = prompt.reject || [];
        assert(
            Array.isArray(rejects) && new Set(rejects).size === rejects.length,
            `Invalid reject array: ${prompt.id}`,
        );
        for (const reject of rejects)
            assert(known.has(reject) && reject !== prompt.gold, `Invalid reject owner: ${prompt.id}`);
        if (prompt.kind === 'boundary') {
            assert(rejects.length > 0, `Boundary has no reject: ${prompt.id}`);
            const pair = [prompt.gold, ...rejects].sort(compareNames).join('|');
            assert(!pairs.has(pair), `Repeated boundary pair: ${prompt.id}`);
            pairs.add(pair);
        }
        if (prompt.kind === 'real-error') {
            assert(
                typeof prompt.exact_error === 'string' && prompt.exact_error.length > 0,
                `Missing exact error: ${prompt.id}`,
            );
            assert(prompt.prompt.includes(prompt.exact_error), `Prompt lost the exact error: ${prompt.id}`);
            assert(
                sourceTexts.some((text) => text.includes(prompt.exact_error)),
                `Exact error absent from cited source: ${prompt.id}`,
            );
            assert(
                prompt.sources.some((source) => source.path.includes('/references/')),
                `Error must cite a reference: ${prompt.id}`,
            );
        }
    }
    assert(
        counts.gold === 22 && counts.boundary === 12 && counts['real-error'] === 10,
        'Required fixture composition is 22/12/10',
    );
    assert(
        JSON.stringify(goldOwners.sort(compareNames)) === JSON.stringify([...names].sort(compareNames)),
        'Gold prompts must cover each of the 22 actual skills exactly once',
    );
    return {
        counts,
        ids: [...ids],
        source_files: parsed.size,
        source_blocks: fixture.prompts.reduce((sum, prompt) => sum + prompt.sources.length, 0),
    };
}

function selectProbe(probe, fixture) {
    assert(probe.schema === 1, 'Unsupported probe fixture schema');
    assert(JSON.stringify(probe.skills) === JSON.stringify(PROBE_SKILLS), 'Probe must retain the five fixed skills');
    assert(
        probe.source_snapshot_hash === fixture.freeze.source_snapshot_hash,
        'Probe binds a different original snapshot',
    );
    assert(
        probe.prompt_payload_sha256 === fixture.freeze.prompt_payload_sha256,
        'Probe binds a different prompt fixture',
    );
    const selected = fixture.prompts.filter((prompt) => PROBE_SKILLS.includes(prompt.gold));
    const expectedIds = selected.map((prompt) => prompt.id);
    assert(
        JSON.stringify(probe.prompt_ids) === JSON.stringify(expectedIds),
        'Probe must include every prompt owned by the fixed five skills, in fixture order',
    );
    assert(probe.ids_sha256 === sha256(JSON.stringify(expectedIds)), 'Frozen probe ID hash mismatch');
    for (const owner of ['cocosair-rendering', 'cocosair-application']) {
        assert(
            selected.some((prompt) => prompt.kind === 'real-error' && prompt.gold === owner),
            `Probe lacks a real error for ${owner}`,
        );
    }
    return selected;
}

function loadSnapshot(snapshotPath) {
    const root = resolveSkillsRoot(snapshotPath);
    const manifestCandidates = [
        path.join(path.resolve(snapshotPath), 'manifest.json'),
        path.join(path.dirname(root), 'manifest.json'),
        path.join(path.resolve(snapshotPath), 'snapshot-manifest.json'),
    ];
    const manifestPath = manifestCandidates.find((filename) => fs.existsSync(filename));
    assert(manifestPath, 'Frozen source snapshot manifest is required');
    const manifestBytes = fs.readFileSync(manifestPath);
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    assert(Array.isArray(manifest.files) && manifest.files.length > 0, 'Snapshot manifest must contain files');
    const declaredHash = manifest.snapshot_hash || manifest.hash;
    assert(declaredHash === sha256(JSON.stringify(manifest.files)), 'Snapshot manifest inventory hash mismatch');
    const actual = inventory(root);
    assert(actual.files.length === manifest.files.length, 'Snapshot file count differs from frozen manifest');
    for (let index = 0; index < actual.files.length; index++) {
        const expected = manifest.files[index];
        const observed = actual.files[index];
        assert(expected.path === observed.path, `Snapshot path mismatch at index ${index}`);
        assert(
            expected.bytes === observed.bytes && expected.sha256 === observed.sha256,
            `Snapshot bytes changed: ${observed.path}`,
        );
    }
    return { root, manifest, actual, hash: declaredHash, manifest_hash: sha256(manifestBytes) };
}

function checkIndex(root, records, indexModule) {
    const projected = records.map(indexModule.projectRoutingRecord);
    const generated = indexModule.generateIndex(root, { allowLegacy: true });
    assert(Array.isArray(generated.skills), 'Shared generateIndex must return an index containing skills');
    const canonical = (rows) => rows.map(indexModule.projectRoutingRecord).sort((a, b) => compareNames(a.name, b.name));
    assert(
        JSON.stringify(canonical(generated.skills)) === JSON.stringify(canonical(projected)),
        'Generated index routing fields differ from snapshot projection',
    );
    const filename = path.join(root, 'index.json');
    if (!fs.existsSync(filename)) return { generated: 'MATCH', on_disk: 'ABSENT_PRE_S3' };
    const disk = readJson(filename);
    assert(Array.isArray(disk.skills), 'On-disk index has no skills');
    const requiredFields = ['name', 'description', 'owns', 'when_to_use', 'not_for'];
    for (const record of disk.skills) {
        assert(
            requiredFields.every((key) => Object.hasOwn(record, key)),
            `On-disk routing fields missing: ${record.name}`,
        );
        assert(
            Object.hasOwn(record.metadata || {}, 'description_zh'),
            `On-disk Chinese routing field missing: ${record.name}`,
        );
    }
    assert(
        JSON.stringify(canonical(disk.skills)) === JSON.stringify(canonical(projected)),
        'On-disk index routing fields differ from candidate projection',
    );
    return { generated: 'MATCH', on_disk: 'MATCH' };
}

function validateProbeCorpus(snapshot, root, actual, parseMarkdown) {
    const exceptions = new Set(PROBE_SKILLS.map((name) => `skills/${name}/SKILL.md`));
    const candidate = new Map(actual.files.map((entry) => [entry.path, entry]));
    for (const original of snapshot.actual.files) {
        const current = candidate.get(original.path);
        assert(current, `Probe candidate removed an original file: ${original.path}`);
        if (exceptions.has(original.path)) {
            const before = parseMarkdown(fs.readFileSync(safeSourcePath(snapshot.root, original.path), 'utf8'), {
                path: original.path,
            });
            const after = parseMarkdown(fs.readFileSync(safeSourcePath(root, original.path), 'utf8'), {
                path: original.path,
            });
            assert(before.body === after.body, `S2p permits metadata edits only: ${original.path}`);
        } else
            assert(
                current.sha256 === original.sha256,
                `S2p changed a frozen competitor or reference: ${original.path}`,
            );
    }
    const originalPaths = new Set(snapshot.actual.files.map((entry) => entry.path));
    const allowedAdded = new Set(['skills/manifest.json', 'skills/index.json', 'skills/INDEX.md']);
    for (const file of actual.files) {
        assert(originalPaths.has(file.path) || allowedAdded.has(file.path), `Unexpected file before S2p: ${file.path}`);
    }
    return { original_competitors: 17, candidate_owners: 5, candidate_skills: 22, metadata_only: true };
}

function normalizedPrerequisiteTable(text) {
    // Only column padding and separator dash widths are layout here. Preserve
    // row order, alignment colons and every byte inside cells, including code.
    const splitRow = (line) => {
        const cells = [];
        let current = '';
        let code = 0;
        let slashes = 0;
        const source = line.replace(/^[ \t]+|[ \t]+$/g, '');
        for (let index = 0; index < source.length; index++) {
            const char = source[index];
            const escaped = slashes % 2 === 1;
            if (char === '`' && !escaped) {
                const run = /^`+/.exec(source.slice(index))[0];
                if (code === run.length) code = 0;
                else if (!code && source.slice(index + run.length).includes(run)) code = run.length;
                current += run;
                index += run.length - 1;
            } else if (char === '|' && !escaped && !code) {
                cells.push(current.replace(/^[ \t]+|[ \t]+$/g, ''));
                current = '';
            } else current += char;
            slashes = char === '\\' ? slashes + 1 : 0;
        }
        cells.push(current.replace(/^[ \t]+|[ \t]+$/g, ''));
        if (source.startsWith('|')) cells.shift();
        if (source.endsWith('|') && cells.at(-1) === '') cells.pop();
        return cells;
    };
    const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n');
    const rows = lines.map(splitRow);
    assert(
        rows.length >= 2 && rows[1].every((cell) => /^:?-{3,}:?$/.test(cell)),
        'Invalid prerequisite table separator',
    );
    assert(
        rows.every((row) => row.length === rows[0].length),
        'Invalid prerequisite table column count',
    );
    rows[1] = rows[1].map((cell) => `${cell.startsWith(':') ? ':' : ''}---${cell.endsWith(':') ? ':' : ''}`);
    return { rows, final_newline: text.endsWith('\n') };
}

function prerequisiteLayout(text, filename, parseMarkdown) {
    const parsed = parseMarkdown(text, { path: filename });
    const offsets = [0];
    for (let index = 0; index < text.length; index++) if (text[index] === '\n') offsets.push(index + 1);
    let cursor = 0;
    const pieces = [];
    for (const block of parsed.blocks.filter((entry) => entry.kind === 'table')) {
        const start = offsets[block.startLine - 1];
        const end = offsets[block.endLine] ?? text.length;
        assert(text.slice(start, end) === block.text, 'Parser table source offsets differ from raw bytes');
        pieces.push({ raw: text.slice(cursor, start) }, { table: normalizedPrerequisiteTable(block.text) });
        cursor = end;
    }
    pieces.push({ raw: text.slice(cursor) });
    return pieces;
}

function validatePrerequisiteSnapshot(original, prerequisite, proof, parseMarkdown, indexModule) {
    assert(proof?.schema === 1 && proof.kind === 'approved-skills-path-prerequisite', 'Unsupported prerequisite proof');
    assert(proof.original_snapshot_hash === original.hash, 'Prerequisite proof original snapshot hash mismatch');
    assert(
        proof.prerequisite_snapshot_hash === prerequisite.hash,
        'Prerequisite proof prerequisite snapshot hash mismatch',
    );
    for (const [key, value] of Object.entries(PREREQUISITE_APPROVAL)) {
        assert(proof.approval?.[key] === value, `Prerequisite approval mismatch: ${key}`);
    }
    const notes = proof.review?.notes;
    assert(
        proof.review?.status === 'approved' &&
            typeof proof.review.reviewer === 'string' &&
            proof.review.reviewer.trim() &&
            ((typeof notes === 'string' && notes.trim()) ||
                (Array.isArray(notes) &&
                    notes.length > 0 &&
                    notes.every((note) => typeof note === 'string' && note.trim()))),
        'Prerequisite needs an approved independent content review with reviewer and notes',
    );
    const expectedPaths = PREREQUISITE_CHANGES.map((entry) => entry.path).sort(compareNames);
    assert(
        Array.isArray(proof.changes) &&
            JSON.stringify(proof.changes.map((entry) => entry.path).sort(compareNames)) ===
                JSON.stringify(expectedPaths),
        'Prerequisite proof must name exactly the four approved changed paths',
    );
    assert(
        Array.isArray(proof.added) && proof.added.length === 1 && proof.added[0].path === PREREQUISITE_ADDED.path,
        'Prerequisite proof must name exactly the one approved added path',
    );
    const before = new Map(original.actual.files.map((file) => [file.path, file]));
    const after = new Map(prerequisite.actual.files.map((file) => [file.path, file]));
    const changed = [];
    for (const file of original.actual.files) {
        const next = after.get(file.path);
        assert(next, `Prerequisite removed an original file: ${file.path}`);
        if (file.sha256 !== next.sha256 || file.bytes !== next.bytes) changed.push(file.path);
    }
    assert(
        JSON.stringify(changed.sort(compareNames)) === JSON.stringify(expectedPaths),
        'Prerequisite actual diff must contain exactly the four approved changed paths',
    );
    const added = prerequisite.actual.files.filter((file) => !before.has(file.path));
    assert(
        added.length === 1 && added[0].path === PREREQUISITE_ADDED.path,
        'Prerequisite actual diff must contain exactly the one approved added path',
    );
    for (const spec of PREREQUISITE_CHANGES) {
        const entry = proof.changes.find((change) => change.path === spec.path);
        assert(entry.from === spec.from && entry.to === spec.to, `Unapproved prerequisite replacement: ${spec.path}`);
        assert(
            entry.before_sha256 === before.get(spec.path).sha256 && entry.after_sha256 === after.get(spec.path).sha256,
            `Prerequisite changed-file proof hash mismatch: ${spec.path}`,
        );
        const oldBytes = fs.readFileSync(safeSourcePath(original.root, spec.path));
        const newBytes = fs.readFileSync(safeSourcePath(prerequisite.root, spec.path));
        const oldText = oldBytes.toString('utf8');
        const newText = newBytes.toString('utf8');
        assert(
            Buffer.from(oldText).equals(oldBytes) && Buffer.from(newText).equals(newBytes),
            'Invalid UTF-8 prerequisite',
        );
        assert(oldText.split(spec.from).length === 2, `Prerequisite replacement must occur exactly once: ${spec.path}`);
        const expected = oldText.replace(spec.from, spec.to);
        assert(
            JSON.stringify(prerequisiteLayout(expected, spec.path, parseMarkdown)) ===
                JSON.stringify(prerequisiteLayout(newText, spec.path, parseMarkdown)),
            `Prerequisite exceeds exact replacement and table alignment: ${spec.path}`,
        );
    }
    const addition = proof.added[0];
    assert(
        addition.sha256 === added[0].sha256 && addition.bytes === added[0].bytes,
        'Prerequisite added-file proof hash/bytes mismatch',
    );
    for (const [key, value] of Object.entries(PREREQUISITE_ADDED)) {
        assert(addition[key] === value, `Prerequisite added-file provenance mismatch: ${key}`);
    }
    const skillFiles = original.actual.files.filter((file) => /^skills\/[^/]+\/SKILL\.md$/.test(file.path));
    assert(skillFiles.length === 22, 'Prerequisite original must contain exactly 22 SKILL.md files');
    for (const file of skillFiles) {
        assert(
            fs
                .readFileSync(safeSourcePath(original.root, file.path))
                .equals(fs.readFileSync(safeSourcePath(prerequisite.root, file.path))),
            `Prerequisite changed original SKILL bytes: ${file.path}`,
        );
    }
    const project = (root) =>
        indexModule
            .loadRoutingRecords(root)
            .map(indexModule.projectRoutingRecord)
            .sort((a, b) => compareNames(a.name, b.name));
    const originals = project(original.root);
    const prerequisites = project(prerequisite.root);
    assert(
        originals.length === 22 && new Set(originals.map((record) => record.name)).size === 22,
        'Prerequisite original must contain 22 distinct routing records',
    );
    assert(
        JSON.stringify(originals) === JSON.stringify(prerequisites),
        'Prerequisite changed original routing projection',
    );
    return {
        original_snapshot_hash: original.hash,
        prerequisite_snapshot_hash: prerequisite.hash,
        prerequisite_manifest_hash: prerequisite.manifest_hash,
        changed_paths: expectedPaths,
        added_paths: added.map((file) => file.path),
        original_skill_bytes_unchanged: true,
        original_routing_projection_unchanged: true,
        approved_content_review: {
            ...proof.review,
            approved_file: { path: addition.path, sha256: addition.sha256, bytes: addition.bytes },
        },
    };
}

function validatePrerequisiteOptions(options) {
    const hasBase = Boolean(options['probe-base']);
    const hasProof = Boolean(options['prerequisite-proof']);
    assert(hasBase === hasProof, '--probe-base and --prerequisite-proof must be supplied together');
    assert(!hasBase || options.probe, '--probe-base and --prerequisite-proof require --probe');
}

function validateBaseline(baseline, metadata, prompts, records, view, recomputed) {
    assert(baseline.schema === REPORT_SCHEMA && baseline.tier === 'T1', 'Unsupported baseline report');
    assert(baseline.mode === 'baseline-capture', 'A candidate report cannot replace the original frozen baseline');
    for (const key of [
        'source_snapshot_hash',
        'source_tree_hash',
        'source_manifest_hash',
        'parser_version',
        'parser_hash',
        'yaml_version',
        'tokenizer_version',
        'tokenizer_hash',
        'projection_version',
        'projection_hash',
        'scorer_version',
        'scorer_hash',
        'prompt_fixture_hash',
        'prompt_payload_hash',
    ])
        assert(baseline.metadata?.[key] === metadata[key], `Baseline metadata mismatch: ${key}`);
    assert(
        JSON.stringify(baseline.metadata.parameters) === JSON.stringify(PARAMETERS),
        'Baseline BM25 parameters differ',
    );
    assert(
        baseline.metadata.candidate_tree_hash === metadata.source_tree_hash,
        'Baseline was not scored on the frozen original tree',
    );
    const original = baseline.views?.[view];
    assert(original && Array.isArray(original.results), `Baseline has no ${view} results`);
    const selected = [];
    const seenIds = new Set();
    for (const result of original.results) {
        assert(!seenIds.has(result.id), `Duplicate baseline result: ${result.id}`);
        seenIds.add(result.id);
    }
    const names = records.map((record) => record.name).sort(compareNames);
    for (const prompt of prompts) {
        const result = original.results.find((entry) => entry.id === prompt.id);
        assert(
            result && result.gold === prompt.gold && result.prompt === prompt.prompt && result.kind === prompt.kind,
            `Missing or altered baseline prompt: ${prompt.id}`,
        );
        assert(
            Array.isArray(result.ranking) && result.ranking.length === 22,
            `Incomplete baseline ranking: ${prompt.id}`,
        );
        assert(
            JSON.stringify(result.ranking.map((entry) => entry.name).sort(compareNames)) === JSON.stringify(names),
            `Invalid baseline competitors: ${prompt.id}`,
        );
        const correctRanking = [...result.ranking].sort((a, b) => b.score - a.score || compareNames(a.name, b.name));
        assert(
            JSON.stringify(correctRanking) === JSON.stringify(result.ranking),
            `Unsorted baseline ranking: ${prompt.id}`,
        );
        result.ranking.forEach((entry, index) =>
            assert(
                Number.isFinite(entry.score) && entry.score >= 0 && entry.rank === index + 1,
                `Invalid baseline score/rank: ${prompt.id}`,
            ),
        );
        const gold = result.ranking.find((entry) => entry.name === result.gold);
        const effective = gold.score > 0 && Array.isArray(gold.matched_terms) && gold.matched_terms.length > 0;
        assert(
            result.gold_rank === gold.rank && result.effective_hit === effective,
            `Inconsistent baseline gold result: ${prompt.id}`,
        );
        const boundary =
            effective &&
            (prompt.reject || []).every((name) => gold.rank < result.ranking.find((entry) => entry.name === name).rank);
        assert(result.boundary_pass === boundary, `Inconsistent baseline boundary: ${prompt.id}`);
        selected.push(result);
    }
    assert(
        recomputed && Array.isArray(recomputed.results),
        'Baseline must be recomputed from frozen original projection',
    );
    assert(
        JSON.stringify(selected) === JSON.stringify(recomputed.results),
        `Baseline scores or rankings differ from frozen original recomputation: ${view}`,
    );
    return { metrics: summarize(selected), results: selected };
}

function parseArgs(argv) {
    const options = {
        snapshot: null,
        root: null,
        prompts: path.join(__dirname, 'fixtures', 'route-prompts.json'),
        baseline: null,
        tier: 'T1',
        view: 'both',
        probe: null,
        'probe-base': null,
        'prerequisite-proof': null,
    };
    const seen = new Set();
    for (let index = 0; index < argv.length; index++) {
        const name = argv[index];
        if (name === '--help') return { help: true };
        const key = name.startsWith('--') ? name.slice(2) : '';
        assert(Object.hasOwn(options, key), `Unknown argument: ${name}`);
        assert(!seen.has(key), `Duplicate argument: ${name}`);
        seen.add(key);
        assert(index + 1 < argv.length && !argv[index + 1].startsWith('--'), `Missing value: ${name}`);
        options[key] = argv[++index];
    }
    assert(options.snapshot, '--snapshot <frozen-dir> is required');
    assert(options.tier === 'T1', 'Only deterministic T1 is implemented; no model calls are made');
    assert(options.view === 'both' || VIEWS.includes(options.view), `Unknown field view: ${options.view}`);
    validatePrerequisiteOptions(options);
    return options;
}

function run(options) {
    validatePrerequisiteOptions(options);
    const parser = require('./lib/md-parse.cjs');
    const indexModule = require('./gen-index.cjs');
    const snapshot = loadSnapshot(options.snapshot);
    const probeBase = options['probe-base'] ? loadSnapshot(options['probe-base']) : snapshot;
    const proofBytes = options['prerequisite-proof'] ? fs.readFileSync(options['prerequisite-proof']) : null;
    const prerequisiteContract = proofBytes
        ? {
              ...validatePrerequisiteSnapshot(
                  snapshot,
                  probeBase,
                  JSON.parse(proofBytes.toString('utf8')),
                  parser.parseMarkdown,
                  indexModule,
              ),
              prerequisite_proof_hash: sha256(proofBytes),
          }
        : null;
    const root = options.root ? resolveSkillsRoot(options.root) : snapshot.root;
    const actual = inventory(root);
    assert(
        options.baseline || actual.hash === snapshot.actual.hash,
        'Candidate scoring requires --baseline from the frozen original snapshot',
    );
    const records = indexModule.loadRoutingRecords(root).sort((a, b) => compareNames(a.name, b.name));
    const originals = indexModule.loadRoutingRecords(snapshot.root).sort((a, b) => compareNames(a.name, b.name));
    const names = records.map((record) => record.name);
    assert(names.length === 22 && new Set(names).size === 22, 'Routing corpus must contain all 22 distinct skills');
    assert(
        JSON.stringify(names) === JSON.stringify(originals.map((record) => record.name)),
        'Candidate skill names differ from frozen snapshot',
    );
    const fixtureBytes = fs.readFileSync(options.prompts);
    const fixture = JSON.parse(fixtureBytes.toString('utf8'));
    assert(fixture.freeze?.source_snapshot_hash === snapshot.hash, 'Fixture belongs to a different source snapshot');
    const audit = validateFixture(fixture, names, snapshot.root, parser.parseMarkdown);
    const probeBytes = options.probe ? fs.readFileSync(options.probe) : null;
    const prompts = probeBytes ? selectProbe(JSON.parse(probeBytes.toString('utf8')), fixture) : fixture.prompts;
    const probeContract = probeBytes ? validateProbeCorpus(probeBase, root, actual, parser.parseMarkdown) : null;
    const metadata = {
        source_snapshot_hash: snapshot.hash,
        source_tree_hash: snapshot.actual.hash,
        source_manifest_hash: snapshot.manifest_hash,
        candidate_tree_hash: actual.hash,
        parser_version: parser.PARSER_VERSION,
        parser_hash: sha256(fs.readFileSync(path.join(__dirname, 'lib', 'md-parse.cjs'))),
        yaml_version: require('js-yaml/package.json').version,
        tokenizer_version: TOKENIZER_VERSION,
        tokenizer_hash: sha256(JSON.stringify(TOKENIZER_CONFIG)),
        tokenizer: TOKENIZER_CONFIG,
        projection_version: indexModule.PROJECTION_VERSION,
        projection_hash: sha256(fs.readFileSync(path.join(__dirname, 'gen-index.cjs'))),
        scorer_version: SCORER_VERSION,
        scorer_hash: sha256(fs.readFileSync(__filename)),
        parameters: PARAMETERS,
        prompt_fixture_hash: sha256(fixtureBytes),
        prompt_payload_hash: fixture.freeze.prompt_payload_sha256,
        probe_fixture_hash: probeBytes ? sha256(probeBytes) : null,
        probe_ids_hash: probeBytes ? sha256(JSON.stringify(prompts.map((prompt) => prompt.id))) : null,
        ...(prerequisiteContract
            ? {
                  original_snapshot_hash: snapshot.hash,
                  prerequisite_snapshot_hash: probeBase.hash,
                  prerequisite_proof_hash: prerequisiteContract.prerequisite_proof_hash,
              }
            : {}),
    };
    const baseline = options.baseline ? readJson(options.baseline) : null;
    metadata.baseline_report_hash = options.baseline ? sha256(fs.readFileSync(options.baseline)) : null;
    const views = {};
    for (const view of options.view === 'both' ? VIEWS : [options.view]) {
        const scored = evaluate(records, prompts, indexModule.serializeRoutingRecord, view);
        const original = baseline
            ? validateBaseline(
                  baseline,
                  metadata,
                  prompts,
                  records,
                  view,
                  evaluate(originals, prompts, indexModule.serializeRoutingRecord, view),
              )
            : null;
        const absolute = absoluteGate(scored.metrics, Boolean(probeBytes));
        const regression = original ? regressionGate(scored.metrics, original.metrics) : null;
        views[view] = {
            ...scored,
            absolute,
            baseline_metrics: original?.metrics || null,
            regression,
            pass: absolute.pass && (regression?.pass ?? true),
            real_error_results: scored.results
                .filter((result) => result.kind === 'real-error')
                .map((result) => ({
                    id: result.id,
                    gold: result.gold,
                    gold_rank: result.gold_rank,
                    effective_hit: result.effective_hit,
                    exact_error: result.exact_error,
                    gold_matched_terms: result.gold_matched_terms,
                    matched_error_tokens: result.matched_error_tokens,
                })),
        };
    }
    const pass = Object.values(views).every((view) => view.pass);
    return {
        schema: REPORT_SCHEMA,
        tier: 'T1',
        mode: baseline ? 'candidate-gate' : 'baseline-capture',
        status: baseline ? (pass ? 'PASS' : 'FAIL') : 'BASELINE_CAPTURED',
        absolute_pass: Object.values(views).every((view) => view.absolute.pass),
        scope: probeBytes ? 'fixed-five-owner-probe' : 'full-44',
        competitor_count: records.length,
        prompt_count: prompts.length,
        prompt_ids: prompts.map((prompt) => prompt.id),
        metadata,
        fixture_audit: audit,
        index_consistency: checkIndex(root, records, indexModule),
        probe_corpus_contract: probeContract,
        ...(prerequisiteContract ? { prerequisite_corpus_contract: prerequisiteContract } : {}),
        source_manifest: snapshot.manifest.files,
        candidate_manifest: actual.files,
        routing_records: records,
        views,
        limitations: ['Lexical T1 only; model selection and actual host support for extended metadata are unverified.'],
    };
}

module.exports = {
    TOKENIZER_VERSION,
    TOKENIZER_CONFIG,
    SCORER_VERSION,
    PARAMETERS,
    VIEWS,
    PROBE_SKILLS,
    PREREQUISITE_CHANGES,
    PREREQUISITE_ADDED,
    PREREQUISITE_APPROVAL,
    sha256,
    tokenize,
    rankRecords,
    evaluate,
    summarize,
    absoluteGate,
    regressionGate,
    inventory,
    validateFixture,
    selectProbe,
    loadSnapshot,
    checkIndex,
    validateProbeCorpus,
    normalizedPrerequisiteTable,
    validatePrerequisiteSnapshot,
    validateBaseline,
    parseArgs,
    run,
};

if (require.main === module) {
    try {
        const options = parseArgs(process.argv.slice(2));
        if (options.help) {
            process.stdout.write(
                `${JSON.stringify({ usage: '--snapshot <frozen-dir> [--root <candidate-skills>] [--prompts <fixture>] [--baseline <report>] [--tier T1] [--view both|host-minimal|suite-extended] [--probe <ids-json> [--probe-base <prerequisite-snapshot> --prerequisite-proof <json>]]', writes: false, model_calls: false }, null, 2)}\n`,
            );
        } else {
            const report = run(options);
            process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
            if (report.status === 'FAIL') process.exitCode = 1;
        }
    } catch (error) {
        process.stdout.write(
            `${JSON.stringify({ schema: REPORT_SCHEMA, tier: 'T1', status: 'ERROR', error: error.message }, null, 2)}\n`,
        );
        process.exitCode = 2;
    }
}
