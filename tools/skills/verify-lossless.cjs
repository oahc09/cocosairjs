#!/usr/bin/env node
'use strict';

// Recovery implementation reconstructed from retained tool-call inputs, not verified old bytes.
// Read-only except explicit --restore-check ... --out <new-directory>; restored code is never executed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseMarkdown, PARSER_VERSION } = require('./lib/md-parse.cjs');

const VERSION = 'skills-lossless-p1-v1-recovery1';
const REPO_ROOT = path.resolve(__dirname, '../..');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const gitBlobSha = (value) => crypto.createHash('sha1').update(`blob ${value.length}\0`).update(value).digest('hex');
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

function invariant(condition, message) {
    if (!condition) throw new Error(message);
}

function assertSafeRelative(value) {
    invariant(
        typeof value === 'string' &&
            value.startsWith('skills/') &&
            !value.includes('\\') &&
            !value.includes('\0') &&
            !value.includes(':') &&
            !value.split('/').some((part) => !part || part === '.' || part === '..'),
        `Unsafe repository-relative path: ${String(value)}`,
    );
    return value;
}

function inside(root, target) {
    const relative = path.relative(root, target);
    return (
        relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
    );
}

function assertNoSymlinkPath(target, allowMissing = false) {
    const absolute = path.resolve(target);
    const parsed = path.parse(absolute);
    let cursor = parsed.root;
    for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor, part);
        let stat;
        try {
            stat = fs.lstatSync(cursor);
        } catch (error) {
            if (allowMissing && error.code === 'ENOENT') return;
            throw error;
        }
        invariant(!stat.isSymbolicLink(), `Symlink is not permitted: ${cursor}`);
    }
}

function readSafeFile(root, relative) {
    assertSafeRelative(relative);
    const absolute = path.resolve(root, relative);
    invariant(inside(path.resolve(root), absolute), `Path escapes root: ${relative}`);
    assertNoSymlinkPath(absolute);
    invariant(fs.lstatSync(absolute).isFile(), `Not a regular file: ${relative}`);
    return fs.readFileSync(absolute);
}

function enumerateFiles(root, prefix = 'skills') {
    assertNoSymlinkPath(root);
    invariant(prefix === 'skills', 'Inventory prefix must be skills');
    invariant(fs.lstatSync(path.join(root, prefix)).isDirectory(), `Not a directory: ${prefix}`);
    const files = [];
    function walk(relative) {
        for (const item of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
            const next = `${relative}/${item.name}`;
            assertSafeRelative(next);
            const stat = fs.lstatSync(path.join(root, next));
            invariant(!stat.isSymbolicLink(), `Symlink is not permitted: ${next}`);
            if (stat.isDirectory()) walk(next);
            else {
                invariant(stat.isFile(), `Unsupported file type: ${next}`);
                const bytes = fs.readFileSync(path.join(root, next));
                files.push({ path: next, sha256: sha256(bytes), bytes: bytes.length, git_blob_sha: gitBlobSha(bytes) });
            }
        }
    }
    walk(prefix);
    return files.sort(byPath);
}

function manifestHash(files) {
    return sha256(
        JSON.stringify(
            [...files].sort(byPath).map(({ path: file, sha256: hash, bytes, git_blob_sha }) => ({
                path: file,
                sha256: hash,
                bytes,
                git_blob_sha,
            })),
        ),
    );
}

function compareManifests(expected, actual) {
    const want = new Map(expected.map((file) => [file.path, file]));
    const got = new Map(actual.map((file) => [file.path, file]));
    const differences = [];
    for (const [file, record] of want) {
        if (!got.has(file)) differences.push({ path: file, problem: 'missing' });
        else if (!same(record, got.get(file))) differences.push({ path: file, problem: 'bytes-or-hash-mismatch' });
    }
    for (const file of got.keys()) if (!want.has(file)) differences.push({ path: file, problem: 'extra' });
    return differences;
}

function loadSnapshot(snapshot) {
    const root = path.resolve(snapshot);
    assertNoSymlinkPath(root);
    const manifestPath = path.join(root, 'manifest.json');
    assertNoSymlinkPath(manifestPath);
    invariant(fs.lstatSync(manifestPath).isFile(), 'Snapshot manifest is not a regular file');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    invariant(manifest.schema === 1, 'Unsupported snapshot manifest schema (expected 1)');
    invariant(
        typeof manifest.base_commit === 'string' && /^[a-f0-9]{7,40}$/.test(manifest.base_commit),
        'Invalid base_commit',
    );
    invariant(Array.isArray(manifest.files) && manifest.files.length > 0, 'Snapshot files must be a nonempty array');
    const names = new Set();
    const files = manifest.files.map((file) => {
        assertSafeRelative(file.path);
        invariant(!names.has(file.path), `Duplicate snapshot path: ${file.path}`);
        names.add(file.path);
        invariant(/^[a-f0-9]{64}$/.test(file.sha256), `Invalid SHA-256: ${file.path}`);
        invariant(/^[a-f0-9]{40}$/.test(file.git_blob_sha), `Invalid Git blob SHA: ${file.path}`);
        invariant(Number.isSafeInteger(file.bytes) && file.bytes >= 0, `Invalid byte count: ${file.path}`);
        return { path: file.path, sha256: file.sha256, bytes: file.bytes, git_blob_sha: file.git_blob_sha };
    });
    invariant(manifest.snapshot_hash === manifestHash(files), 'Snapshot manifest hash mismatch');
    const differences = compareManifests(files, enumerateFiles(root));
    invariant(differences.length === 0, `Snapshot disk mismatch: ${JSON.stringify(differences)}`);
    return { root, skillsRoot: path.join(root, 'skills'), manifest, files, snapshotHash: manifest.snapshot_hash };
}

function resolveRoot(input = path.join(REPO_ROOT, 'skills')) {
    const root = path.resolve(input);
    assertNoSymlinkPath(root);
    const skillsRoot = path.basename(root) === 'skills' ? root : path.join(root, 'skills');
    assertNoSymlinkPath(skillsRoot);
    invariant(fs.statSync(skillsRoot).isDirectory(), 'Expected a repository root or a skills directory');
    return { root: path.dirname(skillsRoot), skillsRoot };
}

function restoreCheck(snapshotPath, outputPath) {
    const snapshot = loadSnapshot(snapshotPath);
    invariant(typeof outputPath === 'string' && outputPath.length > 0, '--out is required for restore-check');
    const output = path.resolve(outputPath);
    assertNoSymlinkPath(output, true);
    invariant(!fs.existsSync(output), 'Restore output must be a new, nonexistent directory');
    invariant(fs.lstatSync(path.dirname(output)).isDirectory(), 'Restore output parent must already exist');
    for (const protectedRoot of [REPO_ROOT, snapshot.root, process.cwd()]) {
        invariant(
            !inside(protectedRoot, output) && !inside(output, protectedRoot),
            'Restore output must be isolated from the source, snapshot, and current working directory',
        );
    }
    fs.mkdirSync(output, { mode: 0o700 });
    for (const file of snapshot.files) {
        const target = path.join(output, file.path);
        fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
        assertNoSymlinkPath(path.dirname(target));
        fs.writeFileSync(target, readSafeFile(snapshot.root, file.path), { flag: 'wx', mode: 0o600 });
    }
    // Copy success is not evidence: independently enumerate and read restored disk files.
    const restored = enumerateFiles(output);
    invariant(same(fs.readdirSync(output).sort(), ['skills']), 'Unexpected restored top-level entries');
    const differences = compareManifests(snapshot.files, restored);
    const sourceAfter = loadSnapshot(snapshot.root);
    invariant(sourceAfter.snapshotHash === snapshot.snapshotHash, 'Source snapshot changed during restoration');
    return {
        schema: 1,
        tool: VERSION,
        mode: 'restore-check',
        status: differences.length === 0 ? 'PASS' : 'FAIL',
        snapshot_hash: snapshot.snapshotHash,
        restored_hash: manifestHash(restored),
        original_manifest: snapshot.files,
        restored_manifest: restored,
        file_count: restored.length,
        bytes: restored.reduce((sum, file) => sum + file.bytes, 0),
        differences,
        source_rechecked: true,
        executed_restored_code: false,
    };
}

function decode(bytes, name) {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        throw new Error(`Invalid UTF-8 Markdown: ${name}`);
    }
}

function flattenFields(value, prefix = '', output = [], ancestors = new Set()) {
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length) {
        invariant(!ancestors.has(value), 'Recursive metadata aliases are not supported');
        ancestors.add(value);
        for (const [key, item] of Object.entries(value))
            flattenFields(item, prefix ? `${prefix}.${key}` : key, output, ancestors);
        ancestors.delete(value);
    } else if (prefix)
        output.push({ field: prefix, value, text: typeof value === 'string' ? value : JSON.stringify(value) });
    return output;
}

function unitsForFile(text, file) {
    if (!file.endsWith('.md')) return [{ id: 'file', kind: 'file', text, hash: sha256(text) }];
    const document = parseMarkdown(text, { path: file });
    const blocks = document.blocks
        .filter((block) => !['frontmatter', 'blank'].includes(block.kind))
        .map((block) => ({ ...block, hash: block.hash || sha256(block.text) }));
    const fields = flattenFields(document.frontmatter?.data || {}).map((field) => ({
        id: `field:${field.field}`,
        kind: 'metadata',
        ...field,
        hash: sha256(JSON.stringify(field.value)),
    }));
    return [...fields, ...blocks];
}

function selectorId(selector) {
    return selector.field ? `field:${selector.field}` : selector.block_id;
}
function selectorKey(selector) {
    return `${selector.path}#${selectorId(selector) || `lines:${selector.start_line}-${selector.end_line}`}`;
}
function normalizeWhitespace(value) {
    return value.replace(/\s+/gu, ' ').trim();
}

function normalizedProse(value) {
    // Inline-code whitespace is data, not layout. Typed parts avoid placeholder collisions.
    const text = value.trim();
    const parts = [];
    const runs = [...text.matchAll(/`+/g)];
    let cursor = 0;
    for (let index = 0; index < runs.length; index++) {
        const opening = runs[index];
        let slashes = 0;
        for (let offset = opening.index - 1; offset >= 0 && text[offset] === '\\'; offset--) slashes++;
        if (slashes % 2) continue;
        const relative = runs.slice(index + 1).findIndex((run) => run[0].length === opening[0].length);
        if (relative < 0) continue;
        const closingIndex = index + 1 + relative;
        const closing = runs[closingIndex];
        parts.push(['prose', text.slice(cursor, opening.index).replace(/\s+/gu, ' ')]);
        parts.push(['inline-code', text.slice(opening.index + opening[0].length, closing.index)]);
        cursor = closing.index + closing[0].length;
        index = closingIndex;
    }
    parts.push(['prose', text.slice(cursor).replace(/\s+/gu, ' ')]);
    return JSON.stringify(parts);
}

function codeBody(text) {
    const lines = text.split('\n');
    const open = /^( {0,3})(`{3,}|~{3,})(.*)\r?$/.exec(lines[0]);
    invariant(open, 'Code preservation requires a fenced code block');
    let closing = lines.length - 1;
    if (lines[closing] === '') closing--;
    const close = new RegExp(`^ {0,3}${open[2][0]}{${open[2].length},}[ \\t]*\\r?$`);
    invariant(close.test(lines[closing]), 'Unclosed code fence');
    return lines.slice(1, closing).join('\n') + (closing > 1 ? '\n' : '');
}

function splitTableRow(line) {
    const cells = [];
    let cell = '';
    let escaped = false;
    const source = line
        .trim()
        .replace(/^\|/, '')
        .replace(/(?<!\\)\|$/, '');
    for (const char of source) {
        if (char === '|' && !escaped) {
            cells.push(cell.trim());
            cell = '';
        } else cell += char;
        escaped = char === '\\' && !escaped;
    }
    cells.push(cell.trim());
    return cells;
}

function normalizedTable(text) {
    const rows = text.trim().split(/\r?\n/).map(splitTableRow);
    invariant(
        rows.length >= 2 && rows[1].every((cell) => /^:?-{3,}:?$/.test(cell)),
        'Invalid Markdown table header separator',
    );
    return {
        header: rows[0].map(normalizedProse),
        rows: rows
            .slice(2)
            .map((row) => JSON.stringify(row.map(normalizedProse)))
            .sort(),
    };
}

function logicalTarget(file, target) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) return target;
    invariant(!target.includes('\\') && !target.includes('\0'), 'Unsafe link target');
    const match = /^([^?#]*)(.*)$/.exec(target);
    let targetPath;
    try {
        targetPath = decodeURIComponent(match[1]);
    } catch {
        throw new Error(`Invalid encoded link target: ${target}`);
    }
    invariant(!path.posix.isAbsolute(targetPath), `Absolute local link is not permitted: ${target}`);
    return `${path.posix.normalize(path.posix.join(path.posix.dirname(file), targetPath || path.posix.basename(file)))}${match[2]}`;
}

function rewriteRecordedLinks(text, file, mappings, side) {
    const relevant = mappings.filter((item) => side === 'source' || item.destination_path === file);
    if (!relevant.length) return text;
    const links = parseMarkdown(text, { path: file }).links;
    const edits = [];
    for (const mapping of relevant) {
        const from = side === 'source' ? mapping.from : mapping.to;
        const matches = links.filter((link) => link.target === from);
        invariant(matches.length > 0, `Recorded ${side} link absent: ${file} -> ${from}`);
        for (const link of matches) {
            invariant(
                Number.isInteger(link.start) && Number.isInteger(link.end),
                'Parser did not expose link target offsets',
            );
            invariant(text.slice(link.start, link.end) === from, 'Link parser offsets do not select the target');
            edits.push({ start: link.start, end: link.end, value: `@logical:${logicalTarget(file, from)}` });
        }
    }
    const unique = [...new Map(edits.map((edit) => [`${edit.start}:${edit.end}`, edit])).values()];
    for (const edit of unique.sort((a, b) => b.start - a.start))
        text = text.slice(0, edit.start) + edit.value + text.slice(edit.end);
    return text;
}

function readSelector(root, selector, cache) {
    invariant(selector && typeof selector === 'object' && !Array.isArray(selector), 'Selector must be an object');
    assertSafeRelative(selector.path);
    if (!cache.has(selector.path)) {
        const text = decode(readSafeFile(root, selector.path), selector.path);
        cache.set(selector.path, { text, units: unitsForFile(text, selector.path) });
    }
    const record = cache.get(selector.path);
    if (selector.field || selector.block_id) {
        const unit = record.units.find((item) => item.id === selectorId(selector));
        invariant(unit, `Missing block/field: ${selectorKey(selector)}`);
        return unit;
    }
    invariant(
        Number.isSafeInteger(selector.start_line) &&
            Number.isSafeInteger(selector.end_line) &&
            selector.start_line >= 1 &&
            selector.end_line >= selector.start_line,
        `Invalid line selector: ${selector.path}`,
    );
    const lines = record.text.split(/(?<=\n)/);
    invariant(selector.end_line <= lines.length, `Line selector exceeds file: ${selector.path}`);
    const text = lines.slice(selector.start_line - 1, selector.end_line).join('');
    return { kind: 'range', text, hash: sha256(text), startLine: selector.start_line, endLine: selector.end_line };
}

function comparePreservation(source, destinations, entry) {
    if (source.kind === 'code' || source.kind === 'fence') {
        invariant(destinations.length === 1, 'Code blocks must map to one intact block');
        invariant(sha256(codeBody(source.text)) === sha256(codeBody(destinations[0].text)), 'Code body hash changed');
        return;
    }
    if (source.kind === 'file') {
        invariant(destinations.length === 1 && source.hash === destinations[0].hash, 'Non-Markdown file bytes changed');
        return;
    }
    const mappings = entry.link_map;
    for (const mapping of mappings) {
        invariant(
            mapping &&
                typeof mapping.from === 'string' &&
                typeof mapping.to === 'string' &&
                entry.destinations.some((item) => item.path === mapping.destination_path),
            'Invalid link_map entry; expected from, to, destination_path',
        );
        invariant(
            logicalTarget(entry.source.path, mapping.from) === logicalTarget(mapping.destination_path, mapping.to),
            `Link rewrite changes logical target: ${mapping.from} -> ${mapping.to}`,
        );
    }
    const from = rewriteRecordedLinks(source.text, entry.source.path, mappings, 'source');
    const to = destinations
        .map((item, index) => rewriteRecordedLinks(item.text, entry.destinations[index].path, mappings, 'destination'))
        .join('\n');
    if (source.kind === 'table')
        invariant(same(normalizedTable(from), normalizedTable(to)), 'Table cell/row multiset changed');
    else if (source.kind === 'heading' && entry.review.heading_rename) {
        const rename = entry.review.heading_rename;
        invariant(
            normalizeWhitespace(from) === rename.from && normalizeWhitespace(to) === rename.to,
            'Heading rename does not match the explicitly reviewed source and destination',
        );
    } else invariant(normalizedProse(from) === normalizedProse(to), 'Original prose/field is not fully preserved');
}

function reachableFiles(root, files) {
    const present = new Set(files.map((file) => file.path));
    const reached = new Set();
    const queue = files.filter((file) => /^skills\/[^/]+\/SKILL\.md$/.test(file.path)).map((file) => file.path);
    for (let index = 0; index < queue.length; index++) {
        const file = queue[index];
        if (reached.has(file)) continue;
        reached.add(file);
        if (!file.endsWith('.md')) continue;
        for (const link of parseMarkdown(decode(readSafeFile(root, file), file), { path: file }).links) {
            if (/^[a-z][a-z0-9+.-]*:/i.test(link.target) || link.target.startsWith('//')) continue;
            const target = logicalTarget(file, link.target).split(/[?#]/)[0];
            if (present.has(target) && !reached.has(target)) queue.push(target);
        }
    }
    return reached;
}

function verifyLossless({ root, snapshot: snapshotPath, ledger, phase = 'P1' }) {
    invariant(phase.toUpperCase() === 'P1', 'Only P1 is implemented; P2 requires separate authorization and tooling');
    const snapshot = loadSnapshot(snapshotPath);
    const candidate = resolveRoot(root);
    const disk = enumerateFiles(candidate.root);
    const reachable = reachableFiles(candidate.root, disk);
    invariant(ledger, '--ledger is required (use an explicit empty ledger for an unchanged tree)');
    const payload = typeof ledger === 'string' ? JSON.parse(fs.readFileSync(ledger, 'utf8')) : ledger;
    invariant(
        payload && payload.schema === 1 && Array.isArray(payload.entries),
        'Ledger must have schema: 1 and entries[]',
    );
    invariant(payload.source_snapshot_hash === snapshot.snapshotHash, 'Ledger snapshot hash mismatch');
    const issues = [];
    const sourceCache = new Map();
    const destinationCache = new Map();
    const entries = new Map();
    const claims = [];
    const destinationIdentity = (selector, unit) => ({
        path: selector.path,
        field: unit.field,
        start: unit.startLine,
        end: unit.endLine,
        whole: unit.kind === 'file',
    });
    const overlaps = (left, right) =>
        left.path === right.path &&
        (left.whole ||
            right.whole ||
            (left.field || right.field
                ? left.field === right.field
                : left.start <= right.end && right.start <= left.end));
    const claim = (selector, unit, source, operation) => {
        const identity = destinationIdentity(selector, unit);
        for (const previous of claims) {
            if (
                overlaps(previous.identity, identity) &&
                previous.source !== source &&
                !(
                    (operation === 'deduplicate' && ['unchanged', 'deduplicate'].includes(previous.operation)) ||
                    (previous.operation === 'deduplicate' && operation === 'unchanged')
                )
            ) {
                issues.push({
                    source,
                    problem: `Reused preservation destination requires explicit deduplication: ${selector.path}`,
                });
            }
        }
        claims.push({ identity, source, operation });
    };
    for (const entry of payload.entries) {
        try {
            invariant(
                entry.source && typeof entry.source === 'object',
                'Ledger source must identify path and block_id/field',
            );
            invariant(
                entry.source.field || entry.source.block_id,
                'Ledger source must identify an original block or field',
            );
            const key = selectorKey(entry.source);
            invariant(!entries.has(key), `Duplicate source ledger entry: ${key}`);
            invariant(['move', 'deduplicate', 'summarize'].includes(entry.operation), 'Invalid ledger operation');
            invariant(Array.isArray(entry.destinations) && entry.destinations.length > 0, 'Empty ledger destinations');
            invariant(Array.isArray(entry.link_map), 'Ledger link_map must be an explicit array');
            invariant(
                entry.review?.status === 'approved' &&
                    typeof entry.review.reviewer === 'string' &&
                    entry.review.reviewer.trim() &&
                    typeof entry.review.notes === 'string' &&
                    entry.review.notes.trim(),
                'Ledger entry lacks an explicit approved review, reviewer, or notes',
            );
            if (entry.operation === 'deduplicate')
                invariant(
                    typeof entry.review.equivalence === 'string' && entry.review.equivalence.trim(),
                    'Deduplication requires a reviewed equivalence explanation',
                );
            invariant(
                snapshot.files.some((item) => item.path === entry.source.path),
                'Ledger source is outside original manifest',
            );
            const source = readSelector(snapshot.root, entry.source, sourceCache);
            invariant(source.hash === entry.source_hash, `Source hash mismatch: ${key}`);
            invariant(source.kind === entry.kind, `Source kind mismatch: ${key}`);
            const destinations = entry.destinations.map((selector) => {
                invariant(
                    reachable.has(selector.path),
                    `Preservation destination is not reachable from a SKILL entry: ${selector.path}`,
                );
                const item = readSelector(candidate.root, selector, destinationCache);
                invariant(
                    /^[a-f0-9]{64}$/.test(selector.hash),
                    `Destination hash is required: ${selectorKey(selector)}`,
                );
                invariant(item.hash === selector.hash, `Destination hash mismatch: ${selectorKey(selector)}`);
                return item;
            });
            comparePreservation(source, destinations, entry);
            entries.set(key, entry);
            destinations.forEach((unit, index) => claim(entry.destinations[index], unit, key, entry.operation));
        } catch (error) {
            issues.push({ source: entry?.source || null, problem: error.message });
        }
    }
    const candidateFiles = new Map(disk.map((file) => [file.path, file]));
    let changedFiles = 0;
    let checkedUnits = 0;
    let unchangedUnits = 0;
    for (const original of snapshot.files) {
        if (candidateFiles.get(original.path)?.sha256 !== original.sha256) changedFiles++;
        try {
            const originalUnits = unitsForFile(
                decode(readSafeFile(snapshot.root, original.path), original.path),
                original.path,
            );
            const currentUnits = candidateFiles.has(original.path)
                ? unitsForFile(decode(readSafeFile(candidate.root, original.path), original.path), original.path)
                : [];
            const available = new Map();
            for (const unit of currentUnits) {
                const key = unit.kind === 'metadata' ? `${unit.id}:${unit.hash}` : `${unit.kind}:${unit.hash}`;
                if (!available.has(key)) available.set(key, []);
                available.get(key).push(unit);
            }
            for (const source of originalUnits) {
                checkedUnits++;
                const contentKey =
                    source.kind === 'metadata' ? `${source.id}:${source.hash}` : `${source.kind}:${source.hash}`;
                const key = `${original.path}#${source.id}`;
                if (entries.has(key)) continue;
                if (available.get(contentKey)?.length) {
                    const pool = available.get(contentKey);
                    const free = pool.findIndex(
                        (unit) =>
                            !claims.some((item) =>
                                overlaps(item.identity, destinationIdentity({ path: original.path }, unit)),
                            ),
                    );
                    const destination = pool.splice(free < 0 ? 0 : free, 1)[0];
                    claim({ path: original.path }, destination, key, 'unchanged');
                    unchangedUnits++;
                } else
                    issues.push({ source: key, problem: 'Changed/deleted original unit lacks valid ledger mapping' });
            }
        } catch (error) {
            issues.push({ source: original.path, problem: error.message });
        }
    }
    const { compareHostContracts } = require('./verify-meta.cjs');
    issues.push(...compareHostContracts(candidate.root, snapshot));
    invariant(
        loadSnapshot(snapshot.root).snapshotHash === snapshot.snapshotHash,
        'Source snapshot changed during validation',
    );
    invariant(
        compareManifests(disk, enumerateFiles(candidate.root)).length === 0,
        'Candidate tree changed during validation',
    );
    return {
        schema: 1,
        tool: VERSION,
        parser_version: PARSER_VERSION,
        phase: 'P1',
        status: issues.length ? 'FAIL' : 'PASS',
        source_snapshot_hash: snapshot.snapshotHash,
        candidate_hash: manifestHash(disk),
        changed_original_files: changedFiles,
        checked_original_units: checkedUnits,
        unchanged_units: unchangedUnits,
        approved_mappings: entries.size,
        issues,
        limitation:
            'Checks explicit block/field preservation and reviews; does not prove semantic equivalence of new summaries.',
    };
}

function main(argv) {
    const options = {};
    for (let index = 0; index < argv.length; index++) {
        const option = argv[index];
        invariant(
            ['--root', '--snapshot', '--ledger', '--phase', '--restore-check', '--out', '--json'].includes(option),
            `Unknown option: ${option}`,
        );
        if (option === '--json') continue;
        invariant(argv[index + 1] && !argv[index + 1].startsWith('--'), `Missing value for ${option}`);
        invariant(options[option] === undefined, `Duplicate option: ${option}`);
        options[option] = argv[++index];
    }
    if (options['--restore-check']) {
        invariant(
            !options['--ledger'] && !options['--snapshot'] && !options['--root'] && !options['--phase'],
            'Restore-check cannot be combined with preservation options',
        );
        return restoreCheck(options['--restore-check'], options['--out']);
    }
    invariant(!options['--out'], '--out is only valid with --restore-check');
    invariant(options['--snapshot'], '--snapshot is required');
    return verifyLossless({
        root: options['--root'],
        snapshot: options['--snapshot'],
        ledger: options['--ledger'],
        phase: options['--phase'],
    });
}

module.exports = {
    VERSION,
    sha256,
    gitBlobSha,
    manifestHash,
    enumerateFiles,
    compareManifests,
    assertSafeRelative,
    assertNoSymlinkPath,
    readSafeFile,
    loadSnapshot,
    resolveRoot,
    restoreCheck,
    flattenFields,
    unitsForFile,
    normalizedTable,
    logicalTarget,
    verifyLossless,
    main,
};

if (require.main === module) {
    try {
        const report = main(process.argv.slice(2));
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        process.exitCode = report.status === 'PASS' ? 0 : 1;
    } catch (error) {
        process.stdout.write(
            `${JSON.stringify({ schema: 1, tool: VERSION, status: 'FAIL', issues: [error.message] }, null, 2)}\n`,
        );
        process.exitCode = 1;
    }
}
