#!/usr/bin/env node
'use strict';

// Deterministic metadata projection and read-only dependency analysis. No bundle mode is implemented.
const fs = require('node:fs');
const path = require('node:path');
const {
    parseMarkdown,
    parseLinks,
    parseArgs,
    resolveSkillsRoot,
    walkFiles,
    codePoints,
    inventory,
    sha256,
} = require('./lib/md-parse.cjs');

const PROJECTION_VERSION = 'air-routing-1';
const SCHEMA = 2;
const lexical = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function projectRoutingRecord(data) {
    if (
        !data ||
        typeof data !== 'object' ||
        Array.isArray(data) ||
        typeof data.name !== 'string' ||
        !data.name.trim() ||
        typeof data.description !== 'string' ||
        !data.description.trim()
    ) {
        throw new Error('Routing name and description must be nonempty strings');
    }
    const list = (field) => {
        if (!own(data, field)) return [];
        if (!Array.isArray(data[field]) || data[field].some((item) => typeof item !== 'string'))
            throw new Error(`${data.name}: ${field} must be a string array`);
        return [...data[field]];
    };
    if (own(data, 'metadata') && (!data.metadata || typeof data.metadata !== 'object' || Array.isArray(data.metadata)))
        throw new Error(`${data.name}: metadata must be a mapping`);
    const descriptionZh = data.metadata && own(data.metadata, 'description_zh') ? data.metadata.description_zh : '';
    if (typeof descriptionZh !== 'string') throw new Error(`${data.name}: metadata.description_zh must be a string`);
    return {
        name: data.name,
        description: data.description,
        owns: list('owns'),
        when_to_use: list('when_to_use'),
        not_for: list('not_for'),
        metadata: { description_zh: descriptionZh },
    };
}

function documents(root) {
    root = resolveSkillsRoot(root);
    const files = walkFiles(root).filter((file) => /^[^/]+\/SKILL\.md$/.test(file));
    if (!files.length) throw new Error('No skills found');
    const names = new Set();
    return files
        .map((file) => {
            const text = new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(path.join(root, file)));
            const parsed = parseMarkdown(text, { path: `skills/${file}` });
            if (!parsed.frontmatter.raw) throw new Error(`${file}: missing frontmatter`);
            const data = parsed.frontmatter.data;
            const record = projectRoutingRecord(data);
            if (names.has(record.name)) throw new Error(`Duplicate skill name: ${record.name}`);
            names.add(record.name);
            if (record.name !== file.split('/')[0])
                throw new Error(`Skill name must equal directory identity: ${file}`);
            return { file, text, parsed, data, record };
        })
        .sort((a, b) => lexical(a.record.name, b.record.name));
}

function loadRoutingRecords(root) {
    return documents(root).map((document) => document.record);
}

function serializeRoutingRecord(record, view = 'host-minimal') {
    const projected = projectRoutingRecord(record);
    let text = `name: ${projected.name}\ndescription: ${projected.description}\n`;
    if (view === 'host-minimal') return text;
    if (view !== 'suite-extended') throw new Error(`unknown routing view: ${view}`);
    for (const field of ['owns', 'when_to_use', 'not_for']) text += `${field}: ${projected[field].join('; ')}\n`;
    return `${text}metadata.description_zh: ${projected.metadata.description_zh}\n`;
}

function familyFor(name) {
    if (
        [
            'cocosair-scene-graph',
            'cocosair-camera',
            'cocosair-rendering',
            'cocosair-materials-effects',
            'cocosair-gltf',
            'cocosair-animation-tween',
            'cocosair-skinning-morph',
            'cocosair-primitives-mesh',
        ].includes(name)
    )
        return 'scene-3d';
    if (['cocosair-ui-2d', 'cocosair-2d-subsystems', 'cocosair-graphics-and-dom'].includes(name)) return 'ui-2d';
    if (['cocosair-input-action', 'cocosair-audio-video', 'cocosair-physics', 'cocosair-particles'].includes(name))
        return 'interaction-media';
    return 'runtime-core';
}

function referencesFor(document, allowLegacy) {
    const headings = document.parsed.headings;
    const selected =
        headings.find((heading) => heading.level === 2 && heading.title === 'Reference map') ||
        (allowLegacy ? headings.find((heading) => heading.level === 2 && heading.title === 'References') : null);
    if (!selected) return [];
    const next = headings.find((heading) => heading.startLine > selected.endLine && heading.level <= selected.level);
    const lines = document.text.split('\n');
    const section = lines.slice(selected.endLine, next ? next.startLine - 1 : lines.length).join('\n');
    const links = parseLinks(section);
    const refs = [];
    for (const line of section.split('\n')) {
        if (!/^\s*[-*+]\s+/.test(line)) continue;
        const lineLinks = parseLinks(line);
        const link = lineLinks.find((item) => !item.referenceId && !/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(item.target));
        if (link) {
            refs.push({
                file: link.target,
                answers: line
                    .slice(link.markupEnd)
                    .replace(/^\s*(?:-|–|—|:|->)\s*/, '')
                    .trim(),
            });
            continue;
        }
        const referenceUse = /^\s*[-*+]\s+\[([^\]]+)\](?:\[([^\]]*)\])?\s*(?:-|–|—|:)\s*(.*)$/.exec(line);
        if (referenceUse) {
            const id = (referenceUse[2] || referenceUse[1]).trim().replace(/\s+/g, ' ').toLowerCase();
            const definition = links.find((item) => item.referenceId === id);
            if (definition) refs.push({ file: definition.target, answers: referenceUse[3].trim() });
            continue;
        }
        // The documented Reference map template also permits literal relative file tokens.
        const bare = /^\s*[-*+]\s+`?((?:references\/|\.\.?\/)[^`\s]+)`?\s+(?:-|–|—|:)\s+(.*)$/.exec(line);
        if (bare) refs.push({ file: bare[1], answers: bare[2].trim() });
    }
    return refs;
}

function generateIndex(root, options = {}) {
    const skills = documents(root).map((document) => {
        const { record, data } = document;
        const layer = data.layer === undefined ? (record.name === 'cocosair' ? 'router' : 'subsystem') : data.layer;
        if (!['router', 'subsystem'].includes(layer)) throw new Error(`${record.name}: invalid layer`);
        const family = data.family === undefined ? familyFor(record.name) : data.family;
        if (typeof family !== 'string' || !family) throw new Error(`${record.name}: family must be a string`);
        const output = {
            name: record.name,
            layer,
            family,
            path: document.file,
            description: record.description,
            owns: record.owns,
            when_to_use: record.when_to_use,
            not_for: record.not_for,
            metadata: record.metadata,
            refs: referencesFor(document, options.allowLegacy !== false),
        };
        if (data.metadata && own(data.metadata, 'last-updated')) {
            if (typeof data.metadata['last-updated'] !== 'string')
                throw new Error(`${record.name}: last-updated must be a string`);
            output.last_updated = data.metadata['last-updated'];
        }
        if (options.enforceBudgets && codePoints(JSON.stringify(output)) > 2000)
            throw new Error(`${record.name}: compact index object exceeds 2,000 Unicode code points`);
        return output;
    });
    return {
        generated_from: 'skills/*/SKILL.md frontmatter + Reference map',
        schema: SCHEMA,
        min_compatible_schema: SCHEMA,
        skills,
    };
}

function renderIndex(index) {
    if (index.schema !== SCHEMA || index.min_compatible_schema !== SCHEMA || !Array.isArray(index.skills))
        throw new Error('Expected index schema 2 with minimum compatible schema 2');
    const escape = (value) =>
        value
            .replace(/\[/g, '\\[')
            .replace(/\]/g, '\\]')
            .replace(/[\r\n]+/g, ' ');
    return (
        '# Cocos AIR skills\n\nGenerated from SKILL.md metadata. Select a primary owner, then only direct dependencies.\n\n' +
        index.skills
            .map(
                (skill) =>
                    `- [${escape(skill.name.replace(/^cocosair-/, ''))}](${skill.path}): ${skill.owns.join(', ')}`,
            )
            .join('\n') +
        '\n'
    );
}

function inside(root, target) {
    const relative = path.relative(root, target);
    return (
        relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
    );
}

function analyzeBundle(root, entry, options = {}) {
    root = resolveSkillsRoot(root);
    const files = walkFiles(root);
    const fileSet = new Set(files);
    const skillNames = files
        .filter((file) => /^[^/]+\/SKILL\.md$/.test(file))
        .map((file) => file.split('/')[0])
        .sort(lexical);
    if (!skillNames.includes(entry)) throw new Error(`Unknown skill entry: ${entry}`);
    // Load only this tool's trusted checker. Never execute code from the analyzed tree.
    const inspect = options.inspect || require('../../skills/cocosair/scripts/check-paths.cjs').inspect;
    if (typeof inspect !== 'function') throw new Error('Canonical navigation inspect() is unavailable');
    const fullInspection = inspect(root);
    const closure = new Set();
    const queue = [];
    const failures = [];
    const navigation = [];
    const addFile = (file) => {
        if (!closure.has(file)) {
            closure.add(file);
            queue.push(file);
        }
    };
    const addSkill = (name) => {
        for (const file of files) if (file.startsWith(`${name}/`)) addFile(file);
    };
    addSkill(entry);
    for (let cursor = 0; cursor < queue.length; cursor++) {
        const file = queue[cursor];
        if (!file.endsWith('.md')) continue;
        const text = new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(path.join(root, file)));
        for (const link of parseLinks(text)) {
            const target = link.target;
            if (/^[a-z]:[/\\]/i.test(target)) {
                failures.push({ file, target });
                continue;
            }
            if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) continue;
            let decoded;
            try {
                decoded = decodeURIComponent(target.split('#')[0]);
            } catch {
                failures.push({ file, target });
                continue;
            }
            const absolute = path.resolve(path.dirname(path.join(root, file)), decoded);
            const relative = path.relative(root, absolute).split(path.sep).join('/');
            navigation.push({ file, target: relative });
            if (
                decoded.includes('\\') ||
                decoded.includes('\0') ||
                path.isAbsolute(decoded) ||
                !inside(root, absolute) ||
                !fileSet.has(relative)
            ) {
                failures.push({ file, target: relative });
                continue;
            }
            const owner = relative.split('/')[0];
            if (skillNames.includes(owner)) addSkill(owner);
            else addFile(relative);
        }
    }
    const closureFiles = [...closure].sort(lexical);
    const closureSkills = skillNames.filter((name) => closure.has(`${name}/SKILL.md`));
    const totalBytes = files.reduce((sum, file) => sum + fs.statSync(path.join(root, file)).size, 0);
    const closureBytes = closureFiles.reduce((sum, file) => sum + fs.statSync(path.join(root, file)).size, 0);
    // inspect() remains the link authority; the boundary check above only enforces containment.
    const closedDirectories = new Set([root]);
    const closedPaths = new Set(closureFiles.map((file) => path.join(root, file)));
    for (const file of closedPaths)
        for (let dir = path.dirname(file); inside(root, dir); dir = path.dirname(dir)) {
            closedDirectories.add(dir);
            if (dir === root) break;
        }
    const isolatedFS = {
        existsSync: (file) => closedPaths.has(file) || closedDirectories.has(file),
        statSync: (file) => ({ isFile: () => closedPaths.has(file), isDirectory: () => closedDirectories.has(file) }),
        readFileSync: (file, encoding) => {
            if (!closedPaths.has(file)) throw new Error('File is outside the closed tree');
            return fs.readFileSync(file, encoding);
        },
        readdirSync: (dir) =>
            [...closedDirectories, ...closedPaths]
                .filter((file) => file !== dir && path.dirname(file) === dir)
                .sort(lexical)
                .map((file) => ({ name: path.basename(file), isDirectory: () => closedDirectories.has(file) })),
    };
    const closureInspection = inspect(root, isolatedFS);
    return {
        status:
            failures.length || fullInspection.status !== 'PASS' || closureInspection.status !== 'PASS'
                ? 'FAIL'
                : 'PASS',
        entry,
        all_skills: skillNames.length,
        all_files: files.length,
        all_bytes: totalBytes,
        closure_skills: closureSkills,
        closure_files: closureFiles,
        closure_bytes: closureBytes,
        byte_ratio: totalBytes ? closureBytes / totalBytes : 0,
        file_ratio: files.length ? closureFiles.length / files.length : 0,
        navigation_targets: navigation,
        failures,
        snapshot_hash: sha256(JSON.stringify(inventory(root))),
        distribution: 'analysis only; no bundle mode implemented',
        inspection: fullInspection,
        closure_inspection: closureInspection,
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2), {
        root: 'value',
        check: 'boolean',
        write: 'boolean',
        'analyze-bundle': 'value',
    });
    const allowed = new Set(['root', 'check', 'write', 'analyze-bundle']);
    for (const key of Object.keys(args)) if (!allowed.has(key)) throw new Error(`Unknown option: --${key}`);
    const modes = ['check', 'write', 'analyze-bundle'].filter((mode) => own(args, mode));
    if (modes.length > 1) throw new Error('Select exactly one mode');
    const mode = modes[0] || 'check';
    if (own(args, 'root') && typeof args.root !== 'string') throw new Error('--root requires a directory');
    for (const flag of ['write', 'check'])
        if (own(args, flag) && args[flag] !== true) throw new Error(`--${flag} takes no value`);
    const root = resolveSkillsRoot(args.root);
    if (mode === 'analyze-bundle') {
        if (typeof args[mode] !== 'string' || !args[mode]) throw new Error('--analyze-bundle requires a skill');
        const report = analyzeBundle(root, args[mode]);
        console.log(JSON.stringify(report, null, 2));
        if (report.status !== 'PASS') process.exitCode = 1;
        return;
    }
    const generated = generateIndex(root, { enforceBudgets: true });
    const prettier = require('prettier');
    const config = (await prettier.resolveConfig(path.resolve(__dirname, '../../.prettierrc.json'))) || {};
    const outputs = [
        ['index.json', await prettier.format(JSON.stringify(generated), { ...config, parser: 'json', tabWidth: 2 })],
        [
            'INDEX.md',
            await prettier.format(renderIndex(generated), {
                ...config,
                parser: 'markdown',
                tabWidth: 2,
                proseWrap: 'preserve',
            }),
        ],
    ];
    // Enumeration already rejected symlinks; recheck the two write targets immediately before writing.
    for (const [name] of outputs) {
        const target = path.join(root, name);
        if (fs.existsSync(target) && (!fs.lstatSync(target).isFile() || fs.lstatSync(target).isSymbolicLink()))
            throw new Error(`Unsafe index output: ${name}`);
    }
    if (mode === 'write') for (const [name, content] of outputs) fs.writeFileSync(path.join(root, name), content);
    const differences = outputs
        .filter(
            ([name, content]) =>
                !fs.existsSync(path.join(root, name)) || fs.readFileSync(path.join(root, name), 'utf8') !== content,
        )
        .map(([name]) => name);
    console.log(
        JSON.stringify(
            { status: differences.length ? 'FAIL' : 'PASS', mode, skills: generated.skills.length, differences },
            null,
            2,
        ),
    );
    if (differences.length) process.exitCode = 1;
}

module.exports = {
    PROJECTION_VERSION,
    SCHEMA,
    projectRoutingRecord,
    loadRoutingRecords,
    serializeRoutingRecord,
    generateIndex,
    renderIndex,
    analyzeBundle,
};
if (require.main === module)
    main().catch((error) => {
        console.log(JSON.stringify({ status: 'FAIL', error: error.message }, null, 2));
        process.exitCode = 1;
    });
