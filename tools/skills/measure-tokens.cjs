#!/usr/bin/env node
'use strict';

// New recovery implementation. This is not a byte-for-byte restoration of the lost tool.
// Read-only: callers explicitly redirect reports. No P2 implementation or automatic P2 approval.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { parseMarkdown, resolveSkillsRoot, PARSER_VERSION } = require('./lib/md-parse.cjs');
const { loadRoutingRecords, serializeRoutingRecord, PROJECTION_VERSION } = require('./gen-index.cjs');
const { assertNoSymlinkPath } = require('./verify-lossless.cjs');

const METRIC_VERSION = 'air-document-input-1';
const TOOL_VERSION = 'skills-measure-p1-recovery1';
const ROUTER = 'skills/cocosair/SKILL.md';
const B2_REFERENCE = 'skills/cocosair-rendering/references/pipeline-reachability.md';
const HASH = /^[a-f0-9]{64}$/;
const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const gitBlobSha = (value) => crypto.createHash('sha1').update(`blob ${value.length}\0`).update(value).digest('hex');
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function invariant(condition, message) {
    if (!condition) throw new Error(message);
}

function decode(bytes, name) {
    try {
        return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
        throw new Error(`Invalid UTF-8 text: ${name}`);
    }
}

function size(text) {
    invariant(typeof text === 'string', 'size requires a string');
    const characters = [...text];
    const han = characters.filter((character) => /\p{Script=Han}/u.test(character)).length;
    return {
        chars: characters.length,
        bytes: Buffer.byteLength(text, 'utf8'),
        han_chars: han,
        other_chars: characters.length - han,
        estimated_tokens: han / 1.5 + (characters.length - han) / 3.8,
    };
}

function total(sizes) {
    const result = { chars: 0, bytes: 0, han_chars: 0, other_chars: 0, estimated_tokens: 0 };
    for (const item of sizes) {
        for (const key of ['chars', 'bytes', 'han_chars', 'other_chars']) result[key] += item[key];
    }
    result.estimated_tokens = result.han_chars / 1.5 + result.other_chars / 3.8;
    return result;
}

function safeRelative(relative, skillsOnly = true) {
    invariant(
        nonempty(relative) &&
            !path.isAbsolute(relative) &&
            !relative.includes('\\') &&
            !relative.includes('\0') &&
            !relative.includes(':') &&
            !relative.split('/').some((part) => !part || part === '.' || part === '..') &&
            (!skillsOnly || relative.startsWith('skills/')),
        `Unsafe relative path: ${String(relative)}`,
    );
    return relative;
}

function readSafe(root, relative, skillsOnly = true) {
    safeRelative(relative, skillsOnly);
    const absolute = path.resolve(root, relative);
    const relation = path.relative(path.resolve(root), absolute);
    invariant(relation !== '..' && !relation.startsWith(`..${path.sep}`), `Path escapes root: ${relative}`);
    assertNoSymlinkPath(absolute);
    invariant(fs.lstatSync(absolute).isFile(), `Not a regular file: ${relative}`);
    return fs.readFileSync(absolute);
}

function readInput(filename) {
    invariant(nonempty(filename), 'An explicit input filename is required');
    assertNoSymlinkPath(filename);
    invariant(fs.lstatSync(filename).isFile(), 'Input must be a regular file');
    return fs.readFileSync(filename);
}

function diskFiles(skillsRoot) {
    assertNoSymlinkPath(skillsRoot);
    invariant(fs.lstatSync(skillsRoot).isDirectory(), 'Skills root must be a directory');
    const files = [];
    function walk(directory, prefix) {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const relative = `${prefix}/${entry.name}`;
            safeRelative(relative);
            const absolute = path.join(directory, entry.name);
            const stat = fs.lstatSync(absolute);
            invariant(!stat.isSymbolicLink(), `Symlink is not permitted: ${relative}`);
            if (stat.isDirectory()) walk(absolute, relative);
            else {
                invariant(stat.isFile(), `Unsupported file type: ${relative}`);
                const bytes = fs.readFileSync(absolute);
                files.push({
                    path: relative,
                    sha256: sha256(bytes),
                    bytes: bytes.length,
                    git_blob_sha: gitBlobSha(bytes),
                });
            }
        }
    }
    walk(skillsRoot, 'skills');
    return files.sort(byPath);
}

function verifiedSnapshot(snapshotDirectory) {
    invariant(nonempty(snapshotDirectory), 'An explicit snapshot directory is required');
    const root = path.resolve(snapshotDirectory);
    assertNoSymlinkPath(root);
    const manifest = JSON.parse(decode(readSafe(root, 'manifest.json', false), 'manifest.json'));
    invariant(manifest.schema === 1, 'Unsupported snapshot schema');
    invariant(
        typeof manifest.base_commit === 'string' && /^[a-f0-9]{7,40}$/.test(manifest.base_commit),
        'Invalid base_commit',
    );
    invariant(Array.isArray(manifest.files) && manifest.files.length > 0, 'Snapshot files must be nonempty');
    const files = manifest.files.map((file) => {
        invariant(object(file), 'Invalid snapshot file');
        safeRelative(file.path);
        invariant(HASH.test(file.sha256), `Invalid file hash: ${file.path}`);
        invariant(/^[a-f0-9]{40}$/.test(file.git_blob_sha), `Invalid Git blob hash: ${file.path}`);
        invariant(Number.isSafeInteger(file.bytes) && file.bytes >= 0, `Invalid file bytes: ${file.path}`);
        return { path: file.path, sha256: file.sha256, bytes: file.bytes, git_blob_sha: file.git_blob_sha };
    });
    invariant(new Set(files.map((file) => file.path)).size === files.length, 'Duplicate snapshot path');
    invariant(
        JSON.stringify(manifest.files) === JSON.stringify([...files].sort(byPath)),
        'Noncanonical snapshot file list',
    );
    invariant(
        HASH.test(manifest.snapshot_hash) && sha256(JSON.stringify(files)) === manifest.snapshot_hash,
        'Snapshot hash mismatch',
    );
    const skillsRoot = path.join(root, 'skills');
    const actual = diskFiles(skillsRoot);
    invariant(isDeepStrictEqual(actual, files), 'Snapshot disk inventory, bytes, SHA-256, or Git blob hash mismatch');
    return { root, skillsRoot, manifest, files, snapshotHash: manifest.snapshot_hash };
}

function l0(root) {
    const skillsRoot = resolveSkillsRoot(root);
    assertNoSymlinkPath(skillsRoot);
    const records = loadRoutingRecords(skillsRoot).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    invariant(
        records.length === 22 && new Set(records.map((record) => record.name)).size === 22,
        'L0 requires exactly 22 unique skill records',
    );
    const text = records.map((record) => serializeRoutingRecord(record, 'host-minimal')).join('\n');
    return {
        view: 'host-minimal',
        rendering: 'serializeRoutingRecord(record,host-minimal),name-sort,join-LF',
        record_count: records.length,
        text,
        hash: sha256(text),
        ...size(text),
    };
}

function measure(root) {
    const skillsRoot = resolveSkillsRoot(root);
    const manifest = diskFiles(skillsRoot);
    const rows = manifest.map((file) => {
        const bytes = readSafe(skillsRoot, file.path.slice('skills/'.length), false);
        invariant(sha256(bytes) === file.sha256 && bytes.length === file.bytes, `Static source changed: ${file.path}`);
        const text = decode(bytes, file.path);
        const isSkill = /^skills\/[^/]+\/SKILL\.md$/.test(file.path);
        const parsed = isSkill ? parseMarkdown(text, { path: file.path }) : null;
        if (isSkill) invariant(parsed.frontmatter?.raw, `Skill has no frontmatter: ${file.path}`);
        return {
            path: file.path,
            sha256: file.sha256,
            full: size(text),
            frontmatter: isSkill ? size(parsed.frontmatter.raw) : null,
            body: isSkill ? size(parsed.body) : null,
        };
    });
    const skills = rows.filter((file) => /^skills\/[^/]+\/SKILL\.md$/.test(file.path));
    invariant(skills.length === 22, 'Static measurement requires exactly 22 skills');
    invariant(
        skills.some((file) => file.path === ROUTER),
        'Router SKILL is missing',
    );
    const references = rows.filter((file) => /^skills\/[^/]+\/references\/.+\.md$/.test(file.path));
    const subsystems = skills.filter((file) => file.path !== ROUTER);
    const entries = total(skills.map((file) => file.full));
    return {
        schema: 1,
        mode: 'static',
        status: 'PASS',
        tool_version: TOOL_VERSION,
        metric_version: METRIC_VERSION,
        parser_version: PARSER_VERSION,
        projection_version: PROJECTION_VERSION,
        source_manifest_hash: sha256(JSON.stringify(manifest)),
        file_count: rows.length,
        skill_count: skills.length,
        l0: l0(skillsRoot),
        layers: {
            all_files: total(rows.map((file) => file.full)),
            skill_full: entries,
            original_frontmatter: total(skills.map((file) => file.frontmatter)),
            skill_body: total(skills.map((file) => file.body)),
            references: total(references.map((file) => file.full)),
        },
        subsystem_skill_mean_bytes: total(subsystems.map((file) => file.full)).bytes / subsystems.length,
        reference_count: references.length,
        giant_reference_count: references.filter((file) => file.full.bytes >= 15000).length,
        files: rows,
    };
}

function sourceSelector(selector, source, documents) {
    invariant(object(selector), 'Source selector must be an object');
    safeRelative(selector.path);
    invariant(nonempty(selector.block_id) && HASH.test(selector.hash), 'Source selector requires block_id and SHA-256');
    invariant(
        source.files.some((file) => file.path === selector.path),
        `Unknown source file: ${selector.path}`,
    );
    if (!documents.has(selector.path)) {
        documents.set(
            selector.path,
            parseMarkdown(decode(readSafe(source.root, selector.path), selector.path), { path: selector.path }),
        );
    }
    const block = documents.get(selector.path).blocks.find((item) => item.id === selector.block_id);
    invariant(
        block && block.hash === selector.hash && sha256(block.text) === selector.hash,
        `Source block hash mismatch: ${selector.path}#${selector.block_id}`,
    );
    return `${selector.path}#${selector.block_id}:${selector.hash}`;
}

function validateScenarios(fixturePath, sourceSnapshotDirectory) {
    const bytes = readInput(fixturePath);
    const fixture = JSON.parse(decode(bytes, 'scenario fixture'));
    invariant(object(fixture) && fixture.schema === 1, 'Unsupported scenario fixture schema');
    invariant(
        Array.isArray(fixture.scenarios) && fixture.scenarios.length === 2,
        'Fixture must contain exactly B1 and B2',
    );
    invariant(
        isDeepStrictEqual(fixture.scenarios.map((scenario) => scenario.id).sort(), ['B1', 'B2']),
        'Fixture must contain exactly one B1 and one B2',
    );
    const source = verifiedSnapshot(sourceSnapshotDirectory);
    invariant(fixture.source_snapshot_hash === source.snapshotHash, 'Fixture source snapshot mismatch');
    const documents = new Map();
    const owners = new Set(loadRoutingRecords(source.skillsRoot).map((record) => record.name));
    for (const scenario of fixture.scenarios) {
        invariant(object(scenario) && nonempty(scenario.question), 'Scenario requires a frozen question');
        invariant(owners.has(scenario.expected_owner), 'Invalid scenario expected_owner');
        invariant(scenario.metric_version === METRIC_VERSION, 'Scenario metric version mismatch');
        invariant(scenario.source_snapshot_hash === source.snapshotHash, 'Scenario source snapshot mismatch');
        invariant(
            object(scenario.read_protocol) && Object.keys(scenario.read_protocol).length > 0,
            'Scenario requires a frozen read_protocol',
        );
        for (const key of [
            'version',
            'operator',
            'reading_method',
            'stop_condition',
            'field_rendering',
            'tool_text_scope',
            'receipts',
        ]) {
            invariant(nonempty(scenario.read_protocol[key]), `Missing read protocol field: ${key}`);
        }
        invariant(scenario.read_protocol.clean_context === true, 'Read protocol must require a clean context');
        invariant(
            scenario.read_protocol.profile === 'A' && scenario.read_protocol.router === ROUTER,
            'Read protocol must use Profile A and its router',
        );
        invariant(
            scenario.read_protocol.field_rendering.includes('host-minimal'),
            'Read protocol must use host-minimal L0',
        );
        for (const [key, value] of Object.entries(scenario.read_protocol)) {
            invariant(
                value !== null && value !== undefined && (typeof value !== 'string' || nonempty(value)),
                `Empty read protocol field: ${key}`,
            );
        }
        invariant(
            Array.isArray(scenario.source_refs) && scenario.source_refs.length > 0,
            'Scenario requires source_refs',
        );
        const references = new Set(scenario.source_refs.map((selector) => sourceSelector(selector, source, documents)));
        invariant(references.size === scenario.source_refs.length, 'Duplicate scenario source selector');
        invariant(
            Array.isArray(scenario.completion_checks) && scenario.completion_checks.length > 0,
            'Scenario requires completion_checks',
        );
        const checkIds = new Set();
        for (const check of scenario.completion_checks) {
            invariant(
                object(check) && nonempty(check.id) && !checkIds.has(check.id),
                'Completion check IDs must be nonempty and unique',
            );
            checkIds.add(check.id);
            invariant(nonempty(check.criterion), 'Completion check requires a factual criterion');
            invariant(
                Array.isArray(check.sources) && check.sources.length > 0,
                'Completion check requires source blocks',
            );
            for (const selector of check.sources) {
                invariant(
                    references.has(sourceSelector(selector, source, documents)),
                    'Completion check source must be a frozen source_ref',
                );
            }
        }
        if (scenario.id === 'B2') {
            invariant(
                scenario.source_refs.some((reference) => reference.path === B2_REFERENCE),
                'B2 must cite its pipeline-reachability reference',
            );
            invariant(
                source.files.find((file) => file.path === B2_REFERENCE)?.bytes >= 15000,
                'B2 source reference must be at least 15 KB',
            );
        }
    }
    return {
        schema: 1,
        scenarios: fixture.scenarios,
        fixture_hash: sha256(bytes),
        source_snapshot_hash: source.snapshotHash,
    };
}

function lineFragments(text, fragments) {
    invariant(Array.isArray(fragments) && fragments.length > 0, 'Partial reads require fragment evidence');
    const lines = text.match(/[^\n]*\n|[^\n]+$/g) || [];
    let previousEnd = 0;
    const parts = [];
    for (const fragment of fragments) {
        invariant(object(fragment), 'Invalid fragment');
        const { start_line: start, end_line: end, hash } = fragment;
        invariant(
            Number.isSafeInteger(start) &&
                Number.isSafeInteger(end) &&
                start >= 1 &&
                end >= start &&
                end <= lines.length,
            'Invalid inclusive 1-based fragment range',
        );
        invariant(start > previousEnd, 'Fragments must be ordered and nonoverlapping');
        const selected = lines.slice(start - 1, end).join('');
        invariant(HASH.test(hash) && sha256(selected) === hash, 'Fragment hash mismatch');
        parts.push(selected);
        previousEnd = end;
    }
    return parts.join('');
}

function validateRead(read, snapshot, fixedScenario) {
    invariant(object(read), 'Invalid read event');
    safeRelative(read.path);
    const file = snapshot.files.find((entry) => entry.path === read.path);
    invariant(file, `Read path absent from snapshot: ${read.path}`);
    invariant(read.content_hash === file.sha256, `Read content hash mismatch: ${read.path}`);
    invariant(
        typeof read.whole_file === 'boolean' && Array.isArray(read.fragments),
        'Read requires whole_file and fragments',
    );
    if (fixedScenario)
        invariant(read.received_untruncated === true, 'Fixed-scenario read lacks an untruncated receipt');
    else invariant(read.received_untruncated !== false, 'Truncated read receipt is not a complete event');
    const bytes = readSafe(snapshot.root, read.path);
    invariant(sha256(bytes) === file.sha256, `Read source changed: ${read.path}`);
    const wholeText = decode(bytes, read.path);
    if (read.whole_file) invariant(read.fragments.length === 0, 'Whole-file reads must have empty fragments');
    const text = read.whole_file ? wholeText : lineFragments(wholeText, read.fragments);
    const measured = size(text);
    invariant(
        Number.isSafeInteger(read.read_chars) && read.read_chars === measured.chars,
        `Actual read_chars mismatch: ${read.path}`,
    );
    invariant(
        Number.isSafeInteger(read.read_bytes) && read.read_bytes === measured.bytes,
        `Actual read_bytes mismatch: ${read.path}`,
    );
    return { measured, file, read };
}

function validStartedAt(value) {
    if (
        typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    )
        return false;
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(value);
    const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
    return (
        month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= new Date(Date.UTC(year, month, 0)).getUTCDate() &&
        hour <= 23 &&
        minute <= 59 &&
        second <= 59
    );
}

function answerReceipt(record, scenario, logDirectory) {
    invariant(nonempty(record.answer_artifact), 'Missing answer_artifact');
    safeRelative(record.answer_artifact, false);
    invariant(HASH.test(record.answer_hash), 'Invalid answer artifact hash');
    const bytes = readSafe(logDirectory, record.answer_artifact, false);
    invariant(
        bytes.length > 0 && sha256(bytes) === record.answer_hash,
        'Answer artifact hash mismatch or empty answer',
    );
    const answer = decode(bytes, record.answer_artifact);
    invariant(
        Array.isArray(record.answer_checks) && record.answer_checks.length === scenario.completion_checks.length,
        'Missing or extra answer checks',
    );
    const ids = new Set();
    for (const check of record.answer_checks) {
        invariant(object(check) && nonempty(check.id) && !ids.has(check.id), 'Duplicate or invalid answer check');
        ids.add(check.id);
        invariant(
            scenario.completion_checks.some((expected) => expected.id === check.id),
            'Unknown answer check',
        );
        invariant(check.passed === true && nonempty(check.evidence), 'Answer check failed or missing evidence');
        invariant(answer.includes(check.evidence), 'Answer check evidence is absent from answer artifact');
    }
    return { path: record.answer_artifact, sha256: record.answer_hash, bytes: bytes.length };
}

function aggregateLoads(loadsPath, snapshotDirectory, options = {}) {
    const snapshot = verifiedSnapshot(snapshotDirectory);
    const overhead = l0(snapshot.skillsRoot);
    const sourceDirectory = options.sourceSnapshot || snapshotDirectory;
    const frozen = options.scenarios ? validateScenarios(options.scenarios, sourceDirectory) : null;
    const input = readInput(loadsPath);
    const text = decode(input, 'load JSONL');
    const entries = [];
    const errors = [];
    for (const [index, line] of text.split(/\r?\n/).entries()) {
        if (!line.trim()) continue;
        try {
            const record = JSON.parse(line);
            invariant(object(record), 'Task must be an object');
            entries.push({ record, line: index + 1 });
        } catch (error) {
            errors.push(`Line ${index + 1}: ${error.message}`);
        }
    }
    if (entries.length === 0) errors.push('No task records; an empty log is not evidence');
    const idCounts = new Map();
    for (const { record } of entries) idCounts.set(record.task_id, (idCounts.get(record.task_id) || 0) + 1);
    const tasks = entries.map(({ record, line }) => {
        const taskErrors = [];
        const capture = (operation) => {
            try {
                return operation();
            } catch (error) {
                taskErrors.push(error.message);
                return null;
            }
        };
        capture(() => {
            invariant(nonempty(record.task_id), 'Task requires task_id');
            invariant(idCounts.get(record.task_id) === 1, 'Duplicate task_id');
            invariant(validStartedAt(record.started_at), 'started_at must be a valid timestamp with timezone');
            invariant(['success', 'failure', 'blocked'].includes(record.outcome), 'Invalid task outcome');
            invariant(record.complete === true, 'Task read log is incomplete');
            invariant(record.snapshot_hash === snapshot.snapshotHash, 'Task snapshot hash mismatch');
            invariant(Array.isArray(record.reads) && record.reads.length > 0, 'Task requires nonempty actual reads');
        });
        let scenario = null;
        let artifact = null;
        if (frozen) {
            scenario = frozen.scenarios.find((item) => item.id === record.scenario_id) || null;
            capture(() => {
                invariant(scenario, 'Unknown or missing scenario_id');
                invariant(record.outcome === 'success', 'Failed or blocked tasks cannot establish benefit');
                invariant(record.metric_version === METRIC_VERSION, 'Task metric version mismatch');
                invariant(record.question_hash === sha256(scenario.question), 'Task question hash mismatch');
                invariant(
                    record.read_protocol_hash === sha256(JSON.stringify(scenario.read_protocol)),
                    'Task read protocol mismatch',
                );
                invariant(record.scenario_fixture_hash === frozen.fixture_hash, 'Task scenario fixture hash mismatch');
                invariant(
                    record.source_snapshot_hash === frozen.source_snapshot_hash,
                    'Task original source snapshot mismatch',
                );
                invariant(record.l0_hash === overhead.hash, 'Task L0 hash mismatch');
                invariant(record.l0_received_untruncated === true, 'Task L0 lacks an untruncated receipt');
                if (record.question !== undefined)
                    invariant(record.question === scenario.question, 'Task question changed');
            });
            if (scenario)
                artifact = capture(() => answerReceipt(record, scenario, path.dirname(path.resolve(loadsPath))));
            capture(() => {
                const routerReads = Array.isArray(record.reads)
                    ? record.reads.filter((read) => read?.path === ROUTER)
                    : [];
                invariant(
                    routerReads.length === 1 && routerReads[0].whole_file === true,
                    'Profile A requires exactly one complete router read',
                );
            });
        } else {
            capture(() => {
                invariant(record.task_kind === 'real', 'M2 requires an explicitly identified real task');
                invariant(
                    record.scenario_id == null &&
                        record.question_hash == null &&
                        record.read_protocol_hash == null &&
                        record.scenario_fixture_hash == null &&
                        record.answer_checks == null,
                    'Fixed or synthetic scenarios cannot be mixed into M2',
                );
                if (record.l0_hash !== undefined) invariant(record.l0_hash === overhead.hash, 'Task L0 hash mismatch');
                invariant(record.l0_received_untruncated !== false, 'Task L0 was truncated');
            });
        }
        const reads = Array.isArray(record.reads) ? record.reads : [];
        const checkedReads = reads.map((read) => capture(() => validateRead(read, snapshot, Boolean(frozen))));
        const valid = taskErrors.length === 0;
        const actual = total([overhead, ...checkedReads.filter(Boolean).map((read) => read.measured)]);
        const recordedChars = reads.reduce(
            (sum, read) => sum + (Number.isSafeInteger(read?.read_chars) && read.read_chars >= 0 ? read.read_chars : 0),
            0,
        );
        const recordedBytes = reads.reduce(
            (sum, read) => sum + (Number.isSafeInteger(read?.read_bytes) && read.read_bytes >= 0 ? read.read_bytes : 0),
            0,
        );
        const referenceReads = checkedReads.filter(
            (read) =>
                read &&
                /^skills\/[^/]+\/references\/.+\.md$/.test(read.file.path) &&
                !/(?:^|\/)(?:context|skill-index|index|readme)\.md$/i.test(read.file.path),
        );
        return {
            task_id: record.task_id ?? null,
            line,
            started_at: record.started_at ?? null,
            outcome: record.outcome ?? null,
            complete: record.complete === true,
            task_kind: record.task_kind ?? null,
            scenario_id: record.scenario_id ?? null,
            status: valid ? 'PASS' : 'FAIL',
            snapshot_hash: record.snapshot_hash ?? null,
            source_snapshot_hash: record.source_snapshot_hash ?? null,
            metric_version: record.metric_version ?? null,
            question_hash: record.question_hash ?? null,
            read_protocol_hash: record.read_protocol_hash ?? null,
            scenario_fixture_hash: record.scenario_fixture_hash ?? null,
            l0_hash: record.l0_hash ?? null,
            l0_received_untruncated: record.l0_received_untruncated ?? null,
            C: valid ? actual.chars : null,
            bytes: valid ? actual.bytes : null,
            estimated_tokens: valid ? actual.estimated_tokens : null,
            read_chars: valid ? actual.chars - overhead.chars : null,
            read_bytes: valid ? actual.bytes - overhead.bytes : null,
            recorded_C: overhead.chars + recordedChars,
            recorded_bytes: overhead.bytes + recordedBytes,
            unique_references: valid ? new Set(referenceReads.map((read) => read.file.path)).size : null,
            giant_reference_hit: valid ? referenceReads.some((read) => read.file.bytes >= 15000) : null,
            reads,
            answer_checks: record.answer_checks ?? null,
            answer_artifact: artifact,
            errors: taskErrors,
        };
    });
    const validTasks = tasks.filter((task) => task.status === 'PASS');
    const validationPassed = errors.length === 0 && tasks.length > 0 && validTasks.length === tasks.length;
    const result = {
        schema: 1,
        mode: frozen ? 'fixed-scenarios' : 'real-task-distribution',
        status: validationPassed ? (frozen ? 'PASS' : 'INSUFFICIENT_EVIDENCE') : 'FAIL',
        validation_status: validationPassed ? 'PASS' : 'FAIL',
        tool_version: TOOL_VERSION,
        metric_version: METRIC_VERSION,
        parser_version: PARSER_VERSION,
        projection_version: PROJECTION_VERSION,
        snapshot_hash: snapshot.snapshotHash,
        source_snapshot_hash: frozen?.source_snapshot_hash ?? null,
        scenario_fixture_hash: frozen?.fixture_hash ?? null,
        loads_hash: sha256(input),
        l0: overhead,
        task_count: tasks.length,
        valid_task_count: validTasks.length,
        tasks,
        errors,
    };
    if (!frozen) {
        result.m2 = {
            status: 'INSUFFICIENT_EVIDENCE',
            complete_real_tasks: validTasks.length,
            average_references: validTasks.length
                ? validTasks.reduce((sum, task) => sum + task.unique_references, 0) / validTasks.length
                : null,
            giant_reference_hit_rate: validTasks.length
                ? validTasks.filter((task) => task.giant_reference_hit).length / validTasks.length
                : null,
            observation_business_days: null,
            complete_population_verified: false,
            reason: 'Explicit logs cannot independently establish a complete five-business-day population; missing tasks are not zero-read tasks.',
            phase_two_authorized: false,
        };
    }
    return result;
}

function compareLoads(candidate, baseline, options = {}) {
    invariant(nonempty(options.scenarios), 'Load benefit diff requires --scenarios');
    invariant(nonempty(options.baselineLoads), 'Load benefit diff requires --baseline-loads');
    invariant(nonempty(options.sourceSnapshot), 'Load benefit diff requires --source-snapshot');
    invariant(
        nonempty(options.candidateLoads) && nonempty(options.candidateSnapshot),
        'Load benefit diff requires candidate logs and snapshot',
    );
    const expectedBaseline = aggregateLoads(options.baselineLoads, options.sourceSnapshot, {
        scenarios: options.scenarios,
        sourceSnapshot: options.sourceSnapshot,
    });
    const expectedCandidate = aggregateLoads(options.candidateLoads, options.candidateSnapshot, {
        scenarios: options.scenarios,
        sourceSnapshot: options.sourceSnapshot,
    });
    invariant(
        isDeepStrictEqual(baseline, expectedBaseline),
        'Baseline report differs from recomputed original logs, answers, or snapshot',
    );
    invariant(
        isDeepStrictEqual(candidate, expectedCandidate),
        'Candidate report differs from recomputed logs, answers, or snapshot',
    );
    invariant(
        candidate.mode === 'fixed-scenarios' && baseline.mode === 'fixed-scenarios',
        'M2 distributions cannot establish fixed-scenario benefit',
    );
    for (const field of [
        'schema',
        'tool_version',
        'metric_version',
        'parser_version',
        'projection_version',
        'scenario_fixture_hash',
        'source_snapshot_hash',
    ]) {
        invariant(candidate[field] === baseline[field], `Benefit report ${field} mismatch`);
    }
    const errors = [];
    const comparisons = [];
    if (candidate.status !== 'PASS' || baseline.status !== 'PASS') errors.push('Both complete load reports must PASS');
    for (const scenarioId of ['B1', 'B2']) {
        const current = candidate.tasks.filter((task) => task.scenario_id === scenarioId);
        if (current.length === 0) continue;
        const original = baseline.tasks.filter((task) => task.scenario_id === scenarioId);
        // Every attempt is retained. Multiple attempts cannot be quietly reduced to the cheapest successful one.
        if (current.length !== 1 || original.length !== 1) {
            errors.push(
                `${scenarioId}: comparison requires exactly one retained attempt on each side; retries require review`,
            );
            continue;
        }
        const next = current[0];
        const before = original[0];
        const mismatch = [
            'scenario_id',
            'question_hash',
            'read_protocol_hash',
            'scenario_fixture_hash',
            'source_snapshot_hash',
            'metric_version',
        ].find((field) => next[field] !== before[field]);
        if (mismatch || next.status !== 'PASS' || before.status !== 'PASS' || !(before.C > 0) || next.C === null) {
            errors.push(`${scenarioId}: invalid original or candidate task${mismatch ? ` (${mismatch})` : ''}`);
            continue;
        }
        const reduction = (before.C - next.C) / before.C;
        comparisons.push({
            scenario_id: scenarioId,
            baseline_C: before.C,
            candidate_C: next.C,
            reduction,
            required_reduction: scenarioId === 'B1' ? 0 : 0.4,
            status: reduction >= (scenarioId === 'B1' ? 0 : 0.4) ? 'PASS' : 'FAIL',
        });
    }
    if (comparisons.length === 0) errors.push('No valid scenario comparisons');
    return {
        status:
            errors.length === 0 && comparisons.every((comparison) => comparison.status === 'PASS') ? 'PASS' : 'FAIL',
        comparisons,
        errors,
        phase_two_authorized: false,
    };
}

function compareStatic(candidate, baseline, sourceSnapshotDirectory) {
    invariant(nonempty(sourceSnapshotDirectory), 'Static diff requires --source-snapshot');
    const source = verifiedSnapshot(sourceSnapshotDirectory);
    const recomputed = measure(source.skillsRoot);
    invariant(
        isDeepStrictEqual(baseline, recomputed),
        'Static baseline differs from the original snapshot recomputation',
    );
    invariant(
        candidate.metric_version === baseline.metric_version &&
            candidate.parser_version === baseline.parser_version &&
            candidate.projection_version === baseline.projection_version,
        'Static baseline version mismatch',
    );
    invariant(
        baseline.l0.chars > 0 && baseline.subsystem_skill_mean_bytes > 0,
        'Static baseline denominator must be positive',
    );
    const l0Reduction = (baseline.l0.chars - candidate.l0.chars) / baseline.l0.chars;
    const entryReduction =
        (baseline.subsystem_skill_mean_bytes - candidate.subsystem_skill_mean_bytes) /
        baseline.subsystem_skill_mean_bytes;
    return {
        status: l0Reduction >= 0.4 && entryReduction >= 0.3 ? 'PASS' : 'FAIL',
        l0_chars_reduction: l0Reduction,
        subsystem_skill_mean_bytes_reduction: entryReduction,
        required_l0_reduction: 0.4,
        required_entry_reduction: 0.3,
        original_snapshot_hash: source.snapshotHash,
        task_benefit_verified: false,
    };
}

function argumentsFor(argv) {
    const valueFlags = new Set(['root', 'diff', 'loads', 'snapshot', 'scenarios', 'source-snapshot', 'baseline-loads']);
    const flags = {};
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        invariant(arg.startsWith('--'), `Unexpected argument: ${arg}`);
        const key = arg.slice(2);
        invariant(key === 'json' || valueFlags.has(key), `Unknown flag: ${arg}`);
        invariant(flags[key] === undefined, `Duplicate flag: ${arg}`);
        if (key === 'json') flags[key] = true;
        else {
            invariant(nonempty(argv[index + 1]) && !argv[index + 1].startsWith('--'), `Missing value: ${arg}`);
            flags[key] = argv[++index];
        }
    }
    return flags;
}

function main(argv = process.argv.slice(2)) {
    const args = argumentsFor(argv);
    let report;
    if (args.loads) {
        invariant(args.snapshot, '--loads requires --snapshot');
        invariant(!args.root, '--loads uses the verified snapshot, not --root');
        invariant(!args['baseline-loads'] || args.diff, '--baseline-loads requires --diff');
        invariant(
            !args['source-snapshot'] || args.scenarios,
            '--source-snapshot for load reports requires --scenarios',
        );
        report = aggregateLoads(args.loads, args.snapshot, {
            scenarios: args.scenarios,
            sourceSnapshot: args['source-snapshot'],
        });
        if (args.diff) {
            const baseline = JSON.parse(decode(readInput(args.diff), 'baseline report'));
            report = {
                ...report,
                diff: compareLoads(report, baseline, {
                    scenarios: args.scenarios,
                    candidateLoads: args.loads,
                    candidateSnapshot: args.snapshot,
                    baselineLoads: args['baseline-loads'],
                    sourceSnapshot: args['source-snapshot'],
                }),
            };
            if (report.diff.status !== 'PASS') report.status = 'FAIL';
        }
    } else {
        invariant(!args.scenarios && !args['baseline-loads'], '--scenarios and --baseline-loads require --loads');
        invariant(!args['source-snapshot'] || args.diff, 'Static --source-snapshot requires --diff');
        invariant(!(args.snapshot && args.root), 'Choose --snapshot or --root for static measurement');
        const root = args.snapshot
            ? verifiedSnapshot(args.snapshot).skillsRoot
            : args.root || path.resolve(__dirname, '../../skills');
        report = measure(root);
        if (args.diff) {
            const baseline = JSON.parse(decode(readInput(args.diff), 'baseline report'));
            report.diff = compareStatic(report, baseline, args['source-snapshot']);
            if (report.diff.status !== 'PASS') report.status = 'FAIL';
        }
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.status === 'FAIL') process.exitCode = 1;
    return report;
}

module.exports = {
    METRIC_VERSION,
    TOOL_VERSION,
    size,
    l0,
    measure,
    verifiedSnapshot,
    validateScenarios,
    aggregateLoads,
    compareLoads,
};

if (require.main === module) {
    try {
        main();
    } catch (error) {
        process.stdout.write(`${JSON.stringify({ status: 'FAIL', error: error.message }, null, 2)}\n`);
        process.exitCode = 1;
    }
}
