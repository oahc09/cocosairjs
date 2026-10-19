#!/usr/bin/env node
'use strict';

// Recovery implementation from retained tool-call inputs, not verified old bytes.
// Read-only. --metadata-only freezes bodies; --skills limits new budgets to explicit selections.
const fs = require('node:fs');
const path = require('node:path');
const { parseMarkdown, PARSER_VERSION } = require('./lib/md-parse.cjs');
const { loadSnapshot, resolveRoot, enumerateFiles, readSafeFile, manifestHash } = require('./verify-lossless.cjs');

const VERSION = 'skills-meta-p1-v1-recovery1';
const codePoints = (value) => [...value].length;
const HOST_FIELDS = [
    'license',
    'compatibility',
    'allowed-tools',
    'metadata.author',
    'metadata.version',
    'metadata.last-updated',
    'metadata.description_zh',
];
const TOP_FIELDS = new Set([
    'name',
    'description',
    'license',
    'compatibility',
    'allowed-tools',
    'when_to_use',
    'owns',
    'not_for',
    'layer',
    'metadata',
]);
const METADATA_FIELDS = new Set(['author', 'version', 'last-updated', 'description_zh']);

function getField(object, name) {
    return name.split('.').reduce((current, key) => current?.[key], object);
}

function readSkills(root) {
    const files = enumerateFiles(root).filter((file) => /^skills\/[^/]+\/SKILL\.md$/.test(file.path));
    if (!files.length) throw new Error('No skills/*/SKILL.md entries found');
    const records = [];
    const issues = [];
    for (const file of files) {
        try {
            const text = new TextDecoder('utf-8', { fatal: true }).decode(readSafeFile(root, file.path));
            const document = parseMarkdown(text, { path: file.path });
            const data = document.frontmatter?.data;
            if (!data || typeof data !== 'object' || Array.isArray(data))
                throw new Error('YAML frontmatter mapping is required');
            records.push({ path: file.path, directory: file.path.split('/')[1], text, document, data });
        } catch (error) {
            issues.push({ path: file.path, field: 'frontmatter', problem: error.message });
        }
    }
    return { records, issues };
}

function compareHostContracts(root, snapshot) {
    const original = readSkills(snapshot.root);
    const current = readSkills(root);
    const issues = [...original.issues, ...current.issues];
    const before = new Map();
    const after = new Map();
    for (const [records, map, side] of [
        [original.records, before, 'snapshot'],
        [current.records, after, 'candidate'],
    ]) {
        for (const record of records) {
            if (typeof record.data.name !== 'string' || !record.data.name) {
                issues.push({ path: record.path, field: 'name', problem: `Invalid ${side} name` });
                continue;
            }
            if (record.data.name !== record.directory)
                issues.push({ path: record.path, field: 'name', problem: 'Name must equal its directory' });
            if (map.has(record.data.name))
                issues.push({ path: record.path, field: 'name', problem: `Duplicate ${side} skill name` });
            map.set(record.data.name, record);
        }
    }
    for (const [name, old] of before) {
        const candidate = after.get(name);
        if (!candidate) {
            issues.push({ path: old.path, field: 'name', problem: `Original skill is missing: ${name}` });
            continue;
        }
        if (candidate.path !== old.path)
            issues.push({ path: candidate.path, field: 'name', problem: 'Original skill path changed' });
        for (const field of HOST_FIELDS) {
            const expected = getField(old.data, field);
            const actual = getField(candidate.data, field);
            if (typeof expected !== 'string' || typeof actual !== 'string' || actual !== expected)
                issues.push({
                    path: candidate.path,
                    field,
                    problem: 'Host metadata must remain an identical string at its original field location',
                });
        }
    }
    for (const [name, record] of after)
        if (!before.has(name))
            issues.push({ path: record.path, field: 'name', problem: `Unexpected skill name: ${name}` });
    return issues;
}

function validateRecord(record, names, metadataOnly) {
    const issues = [];
    const issue = (field, problem) => issues.push({ path: record.path, field, problem });
    const data = record.data;
    const string = (field) => {
        const value = getField(data, field);
        if (typeof value !== 'string' || !value.trim()) {
            issue(field, 'Must be a nonempty string');
            return null;
        }
        return value;
    };
    const name = string('name');
    if (name && (codePoints(name) > 32 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)))
        issue('name', 'Must be a lowercase kebab identifier of at most 32 Unicode code points');
    if (name !== record.directory) issue('name', 'Name must equal its directory');
    const description = string('description');
    if (description && codePoints(description) > 180) issue('description', 'Exceeds 180 Unicode code points');
    for (const field of HOST_FIELDS) string(field);
    for (const field of Object.keys(data))
        if (!TOP_FIELDS.has(field)) issue(field, 'Unsupported top-level field or misplaced metadata');
    if (!data.metadata || typeof data.metadata !== 'object' || Array.isArray(data.metadata))
        issue('metadata', 'Must be a YAML mapping');
    else
        for (const field of Object.keys(data.metadata))
            if (!METADATA_FIELDS.has(field)) issue(`metadata.${field}`, 'Unsupported or retired metadata field');
    if (
        'description_en' in data ||
        (data.metadata && typeof data.metadata === 'object' && 'description_en' in data.metadata)
    )
        issue('description_en', 'The duplicate description_en field must not reappear');
    const list = (field, minimum, maximum) => {
        const value = data[field];
        if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
            issue(field, `Must be an array containing ${minimum}–${maximum} strings`);
            return [];
        }
        if (value.some((item) => typeof item !== 'string' || !item.trim())) {
            issue(field, 'Every entry must be a nonempty string');
            return [];
        }
        if (new Set(value).size !== value.length) issue(field, 'Duplicate entries are not permitted');
        return value;
    };
    for (const value of list('when_to_use', 1, 5))
        if (value.trim().split(/\s+/u).length > 10)
            issue('when_to_use', 'Every trigger must contain at most 10 whitespace-separated words');
    list('owns', 3, 6);
    for (const value of list('not_for', 0, 3)) {
        if (codePoints(value) > 80) issue('not_for', 'Every boundary must contain at most 80 Unicode code points');
        const match = /^(.+?)\s+->\s+([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(value);
        if (!match || !match[1].trim() || !names.has(match[2]) || match[2] === name)
            issue('not_for', 'Expected symptom -> another valid skill name');
    }
    if (data.layer !== (name === 'cocosair' ? 'router' : 'subsystem'))
        issue('layer', 'Expected router for cocosair, subsystem for every other skill');
    const frontmatter = record.document.frontmatter.raw;
    if (typeof frontmatter !== 'string') issue('frontmatter', 'Parser did not preserve complete raw frontmatter');
    else if (codePoints(frontmatter) > 1400)
        issue('frontmatter', 'Complete frontmatter exceeds 1,400 Unicode code points');
    if (!metadataOnly && Buffer.byteLength(record.text, 'utf8') > (name === 'cocosair' ? 4200 : 4000))
        issue('SKILL.md', `Complete entry exceeds ${name === 'cocosair' ? '4,200' : '4,000'} UTF-8 bytes`);
    return issues;
}

function checkIndex(skillsRoot, names, required) {
    const issues = [];
    const indexPath = path.join(skillsRoot, 'index.json');
    if (!fs.existsSync(indexPath)) {
        if (required)
            issues.push({
                path: 'skills/index.json',
                problem: 'Generated index is required outside metadata-only validation',
            });
        return issues;
    }
    try {
        const index = JSON.parse(readSafeFile(path.dirname(skillsRoot), 'skills/index.json').toString('utf8'));
        if (index.schema !== 2 || index.min_compatible_schema !== 2 || !Array.isArray(index.skills))
            throw new Error('Expected index schema: 2, min_compatible_schema: 2, and skills[]');
        const seen = new Set();
        for (const skill of index.skills) {
            if (!skill || typeof skill !== 'object' || Array.isArray(skill))
                throw new Error('Index skill must be an object');
            if (!names.has(skill.name) || seen.has(skill.name))
                throw new Error(`Unexpected/duplicate index name: ${skill.name}`);
            seen.add(skill.name);
            if (codePoints(JSON.stringify(skill)) > 2000)
                issues.push({
                    path: 'skills/index.json',
                    field: skill.name,
                    problem: 'Compact skill object exceeds 2,000 Unicode code points',
                });
        }
        if (seen.size !== names.size) throw new Error('Index is missing skill names');
    } catch (error) {
        issues.push({ path: 'skills/index.json', problem: error.message });
    }
    return issues;
}

function verifyMeta({ root, snapshot: snapshotPath, metadataOnly = false, skills = null }) {
    if (!snapshotPath) throw new Error('--snapshot is required to verify the original host contracts');
    if (skills && !metadataOnly) throw new Error('--skills is only valid with explicit --metadata-only');
    const candidate = resolveRoot(root);
    const snapshot = loadSnapshot(snapshotPath);
    const current = readSkills(candidate.root);
    const original = readSkills(snapshot.root);
    const names = new Set(current.records.map((record) => record.data.name));
    const selected = skills ? new Set(skills) : names;
    if (!selected.size || [...selected].some((name) => !names.has(name)))
        throw new Error('--skills contains an empty or unknown skill selection');
    const issues = [...current.issues, ...compareHostContracts(candidate.root, snapshot)];
    for (const record of current.records)
        if (selected.has(record.data.name)) issues.push(...validateRecord(record, names, metadataOnly));
    if (metadataOnly) {
        const originals = new Map(original.records.map((record) => [record.path, record]));
        for (const record of current.records) {
            const old = originals.get(record.path);
            if (old && record.document.body !== old.document.body)
                issues.push({
                    path: record.path,
                    field: 'body',
                    problem: 'Metadata-only validation requires every original body byte to remain unchanged',
                });
        }
        const candidates = new Map(enumerateFiles(candidate.root).map((file) => [file.path, file]));
        for (const file of snapshot.files) {
            const skill = /^skills\/([^/]+)\/SKILL\.md$/.exec(file.path);
            if (skill && selected.has(skill[1])) continue;
            if (candidates.get(file.path)?.sha256 !== file.sha256)
                issues.push({
                    path: file.path,
                    problem: 'Unselected original file changed during metadata-only validation',
                });
        }
        for (const file of candidates.keys()) {
            if (
                !snapshot.files.some((originalFile) => originalFile.path === file) &&
                !['skills/manifest.json', 'skills/index.json', 'skills/INDEX.md'].includes(file)
            )
                issues.push({ path: file, problem: 'Unexpected new file during metadata-only validation' });
        }
    }
    issues.push(...checkIndex(candidate.skillsRoot, names, !metadataOnly));
    const disk = enumerateFiles(candidate.root);
    return {
        schema: 1,
        tool: VERSION,
        parser_version: PARSER_VERSION,
        status: issues.length ? 'FAIL' : 'PASS',
        mode: metadataOnly ? 'metadata-only' : 'P1-final',
        source_snapshot_hash: snapshot.snapshotHash,
        candidate_hash: manifestHash(disk),
        original_skill_count: original.records.length,
        validated_skills: [...selected].sort(),
        budgets: {
            description_code_points: 180,
            frontmatter_code_points: 1400,
            subsystem_bytes: 4000,
            router_bytes: 4200,
            index_object_code_points: 2000,
        },
        issues,
    };
}

function main(argv) {
    const options = {};
    for (let index = 0; index < argv.length; index++) {
        const option = argv[index];
        if (option === '--metadata-only') options.metadataOnly = true;
        else if (option === '--json') continue;
        else if (['--root', '--snapshot', '--skills'].includes(option)) {
            if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`Missing value for ${option}`);
            const key = option.slice(2);
            if (options[key] !== undefined) throw new Error(`Duplicate option: ${option}`);
            options[key] = argv[++index];
        } else throw new Error(`Unknown option: ${option}`);
    }
    if (options.skills) options.skills = options.skills.split(',').map((name) => name.trim());
    return verifyMeta(options);
}

module.exports = {
    VERSION,
    HOST_FIELDS,
    codePoints,
    readSkills,
    compareHostContracts,
    validateRecord,
    checkIndex,
    verifyMeta,
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
