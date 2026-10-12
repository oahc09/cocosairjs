'use strict';
// Wave5 same-source effect docs generator: derives TypeScript parameter types, API docs,
// parameter tables, Agent reference and validation metadata from the 13 frozen
// EffectDefinitions (12 parameters.json + 1 E01 static TS literal). --write regenerates the
// declared artifacts byte-deterministically; --check recomputes and compares without writing.
// This tool documents the EXISTING native API contract — it does not create a new runtime.
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');

const EXAMPLES = Object.freeze([
    { id: 'E01', dir: 'shader-noise-dissolve', source: 'parameters.ts' },
    { id: 'E02', dir: 'shader-thin-film', source: 'parameters.json' },
    { id: 'E03', dir: 'shader-holographic', source: 'parameters.json' },
    { id: 'E04', dir: 'shader-neon', source: 'parameters.json' },
    { id: 'E05', dir: 'shader-emboss', source: 'parameters.json' },
    { id: 'E06', dir: 'shader-sparkle', source: 'parameters.json' },
    { id: 'E07', dir: 'shader-liquid-metal', source: 'parameters.json' },
    { id: 'E08', dir: 'shader-cursor-trail', source: 'parameters.json' },
    { id: 'E09', dir: 'shader-glass', source: 'parameters.json' },
    { id: 'C01', dir: 'shader-laser-card', source: 'parameters.json' },
    { id: 'C02', dir: 'shader-film-neon', source: 'parameters.json' },
    { id: 'C03', dir: 'shader-glass-trail', source: 'parameters.json' },
    { id: 'C04', dir: 'shader-input-dissolve', source: 'parameters.json' },
]);

const GENERATED = Object.freeze({
    types: 'tools/generated/shaders-effect-params.d.ts',
    api: 'docs/effects/generated/shaders-effect-api.md',
    parameters: 'docs/effects/generated/shaders-effect-parameters.md',
    agent: 'docs/effects/generated/shaders-effect-agent-reference.md',
    validation: 'docs/effects/generated/shaders-effect-validation-metadata.json',
});

const ts = require('typescript');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const contract = require('../verify/shaders-effect-contract.cjs');
const { validateAPIEvidence } = require('../verify/shaders-api-evidence.cjs');
const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
const plain = (v) =>
    v !== null &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(v));
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const fingerprint = (root, file) => {
    const bytes = fs.readFileSync(path.join(root, file));
    return { path: file.replace(/\\/g, '/'), bytes: bytes.length, sha256: hash(bytes) };
};

function parseSource(source) {
    const ast = ts.createSourceFile('parameters.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    if (ast.parseDiagnostics.length) throw new Error('TS_PARSE_ERROR');
    return ast;
}
function literal(node) {
    if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) return literal(node.expression);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) {
        const value = Number(node.text);
        if (!Number.isFinite(value)) throw new Error('NON_FINITE_LITERAL');
        return value;
    }
    if (
        ts.isPrefixUnaryExpression(node) &&
        node.operator === ts.SyntaxKind.MinusToken &&
        ts.isNumericLiteral(node.operand)
    )
        return -literal(node.operand);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
    if (ts.isObjectLiteralExpression(node)) {
        const result = {};
        for (const prop of node.properties) {
            if (!ts.isPropertyAssignment(prop) || !(ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)))
                throw new Error('UNSUPPORTED_LITERAL_PROPERTY');
            const key = prop.name.text;
            if (own(result, key)) throw new Error('DUPLICATE_LITERAL_KEY');
            Object.defineProperty(result, key, {
                value: literal(prop.initializer),
                enumerable: true,
                writable: true,
                configurable: true,
            });
        }
        return result;
    }
    throw new Error('UNSUPPORTED_LITERAL_EXPRESSION');
}
function extractTsLiteral(source) {
    const ast = parseSource(source);
    const declarations = ast.statements
        .filter((s) => ts.isVariableStatement(s) && s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
        .flatMap((s) => [...s.declarationList.declarations])
        .filter((d) => ts.isIdentifier(d.name) && d.name.text === 'definition');
    if (declarations.length !== 1 || !declarations[0].initializer) throw new Error('DEFINITION_EXPORT_REQUIRED');
    const result = literal(declarations[0].initializer);
    if (!plain(result)) throw new Error('DEFINITION_OBJECT_REQUIRED');
    return result;
}
// Copy only JSON data after rejecting accessors/prototypes/cycles; never invoke getters.
function jsonData(value) {
    const visit = (v, parents) => {
        if (v === null || ['string', 'boolean'].includes(typeof v)) return;
        if (typeof v === 'number' && Number.isFinite(v)) return;
        if (!Array.isArray(v) && !plain(v)) throw new Error('PLAIN_JSON_REQUIRED');
        if (parents.has(v)) throw new Error('JSON_CYCLE');
        parents.add(v);
        if (Array.isArray(v)) {
            for (let i = 0; i < v.length; i++) if (!own(v, i)) throw new Error('JSON_ARRAY_HOLE');
        }
        for (const key of Reflect.ownKeys(v)) {
            if (Array.isArray(v) && key === 'length') continue;
            if (Array.isArray(v) && (!/^(0|[1-9][0-9]*)$/.test(String(key)) || Number(key) >= v.length))
                throw new Error('JSON_ARRAY_PROPERTY');
            const d = Object.getOwnPropertyDescriptor(v, key);
            if (typeof key !== 'string' || !own(d, 'value')) throw new Error('JSON_ACCESSOR_OR_SYMBOL');
            visit(d.value, parents);
        }
        parents.delete(v);
    };
    visit(value, new Set());
    return JSON.parse(JSON.stringify(value));
}
function normalizeDefinition(source) {
    const d = jsonData(source);
    if (!plain(d) || !plain(d.params)) throw new Error('DEFINITION_RECORD_REQUIRED');
    if (d.schemaVersion && d.schema && d.schemaVersion !== d.schema) throw new Error('SCHEMA_ALIAS_CONFLICT');
    const sourceSchema = d.schemaVersion || d.schema || 'shaders-effect-contract/1';
    if (!['shaders-effect-contract/1', 'effect-parameters/1'].includes(sourceSchema))
        throw new Error('UNKNOWN_SOURCE_SCHEMA');
    const normalized = { schemaVersion: 'shaders-effect-contract/1', name: d.name, version: d.version, params: {} };
    for (const [name, p] of Object.entries(d.params)) {
        if (!plain(p)) throw new Error('DESCRIPTOR_RECORD_REQUIRED');
        if (
            own(p, 'default') &&
            own(p, 'defaultValue') &&
            contract.canonical(p.default) !== contract.canonical(p.defaultValue)
        )
            throw new Error('DEFAULT_ALIAS_CONFLICT');
        if (own(p, 'values') && own(p, 'enum') && contract.canonical(p.values) !== contract.canonical(p.enum))
            throw new Error('ENUM_ALIAS_CONFLICT');
        const descriptor = { ...p };
        if (own(p, 'default')) descriptor.defaultValue = p.default;
        if (own(p, 'values')) descriptor.enum = p.values;
        delete descriptor.default;
        delete descriptor.values;
        if (p.type === 'enum') descriptor.type = 'string';
        // Legacy C04 route actually retires/rebuilds the instance. Source stays frozen.
        descriptor.updateMode =
            p.updateMode === 'variant-or-uniform'
                ? 'pipeline'
                : p.updateMode || (d.name === 'inputDissolve' && name === 'route' ? 'structure' : 'uniform');
        Object.defineProperty(normalized.params, name, { value: descriptor, enumerable: true });
    }
    return normalized;
}
function validateDefinitionShape(d) {
    try {
        return contract.validateDefinition(normalizeDefinition(d)).errors;
    } catch (error) {
        return [String(error.message)];
    }
}
function computeStructureKey(definition, actualParameters, identity = {}) {
    const d = normalizeDefinition(definition);
    const checked = contract.validateParameters(d, actualParameters || {}, {
        defaults: actualParameters === undefined,
    });
    if (!checked.ok) throw new Error(JSON.stringify(checked.errors));
    const structural = Object.fromEntries(
        Object.entries(d.params)
            .filter(([, p]) => ['structure', 'pipeline'].includes(p.updateMode))
            .map(([k]) => [k, checked.values[k]]),
    );
    return hash(contract.canonical({ definition: d, identity: jsonData(identity), structural }));
}
function parameterKeys(source) {
    const ast = parseSource(source);
    const types = ast.statements.filter(
        (s) =>
            (ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) &&
            s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
            /(?:Params|Parameters)$/.test(s.name.text),
    );
    if (types.length !== 1) throw new Error('EXACT_PARAMETER_TYPE_REQUIRED');
    const members = ts.isInterfaceDeclaration(types[0]) ? types[0].members : types[0].type.members;
    if (!members) throw new Error('PARAMETER_TYPE_LITERAL_REQUIRED');
    return members
        .map((m) => {
            if (!ts.isPropertySignature(m) || !(ts.isIdentifier(m.name) || ts.isStringLiteral(m.name)))
                throw new Error('PARAMETER_PROPERTY_REQUIRED');
            return m.name.text;
        })
        .sort();
}
function checkSourceContracts(defs, options = {}) {
    const root = options.root || ROOT;
    const errors = [];
    try {
        const inventory = JSON.parse(fs.readFileSync(path.join(root, 'docs/example-api-inventory.json'), 'utf8'));
        const sdk = fingerprint(root, 'build/cocosair.module.d.ts');
        if (
            inventory.source !== sdk.path ||
            !sdk.sha256.startsWith(inventory.sourceFingerprint) ||
            inventory.sourceFingerprint.length < 16
        )
            errors.push('API inventory SDK fingerprint drift');
        for (const { id, dir, definition } of defs) {
            try {
                const base = path.join(root, 'examples', dir);
                const keys = parameterKeys(fs.readFileSync(path.join(base, 'src/parameters.ts'), 'utf8'));
                if (contract.canonical(keys) !== contract.canonical(Object.keys(definition.params).sort()))
                    errors.push(`${id}: exact parameter keys disagree`);
                const spec = JSON.parse(fs.readFileSync(path.join(base, 'example.json'), 'utf8'));
                const api = validateAPIEvidence(base, spec);
                errors.push(...api.errors.map((e) => `${id}: ${e}`));
                for (const name of [...(spec.api?.claims || []), ...(spec.api?.evidence || []).map((e) => e.api)])
                    if (!own(inventory.units, name)) errors.push(`${id}: unknown public SDK API ${name}`);
                const normalized = normalizeDefinition(definition);
                if (
                    ['C01', 'C02', 'C03'].includes(id) &&
                    !Object.values(normalized.params).some((p) => ['structure', 'pipeline'].includes(p.updateMode))
                )
                    errors.push(`${id}: missing structural parameter`);
            } catch (error) {
                errors.push(`${id}: ${error.message}`);
            }
        }
    } catch (error) {
        errors.push('Source contract: ' + error.message);
    }
    return errors;
}

// ── Artifact renderers (byte-deterministic; no timestamps) ──
function interfaceName(name) {
    return name.replace(/[-_](.)/g, (_, c) => c.toUpperCase()).replace(/^(.)/, (c) => c.toUpperCase());
}
function getEnumList(p) {
    return p.enum || p.values || null;
}
function getDefault(p) {
    return p.defaultValue !== undefined ? p.defaultValue : p.default;
}

const PASS_COUNTS = {
    E01: 1,
    E02: 1,
    E03: 1,
    E04: 1,
    E05: 2,
    E06: 1,
    E07: 1,
    E08: 1,
    E09: 2,
    C01: 3,
    C02: 1,
    C03: 2,
    C04: 'image=1, procedural/rendered=2',
};

function renderTypes(defs) {
    const lines = [
        '// Generated by tools/examples/shaders-effect-docs.cjs from the 13 frozen EffectDefinitions.',
        '// DO NOT EDIT: regenerate with `node tools/examples/shaders-effect-docs.cjs --write`.',
        '',
    ];
    for (const { id, definition } of defs) {
        const iface = interfaceName(definition.name);
        lines.push(`/** ${id} ${definition.name} v${definition.version} parameter contract. */`);
        lines.push(`export interface ${iface}Params {`);
        for (const [key, p] of Object.entries(definition.params)) {
            const enumList = getEnumList(p);
            const typeText =
                p.type === 'number'
                    ? 'number'
                    : p.type === 'boolean'
                      ? 'boolean'
                      : enumList
                        ? enumList.map((v) => JSON.stringify(v)).join(' | ')
                        : 'string';
            const range = p.type === 'number' ? ` [${p.min}, ${p.max}] step ${p.step}` : '';
            lines.push(
                `    /** ${String(p.description || key).replace(/\*\//g, '* /')}${range}. Default: ${JSON.stringify(getDefault(p))}. */`,
            );
            lines.push(`    ${JSON.stringify(key)}: ${typeText};`);
        }
        lines.push('}');
        lines.push('');
    }
    lines.push(
        `export type AnyEffectParams = ${defs.map(({ definition }) => `${interfaceName(definition.name)}Params`).join(' | ')};`,
    );
    lines.push('');
    return lines.join('\n');
}

function renderParameters(defs) {
    const lines = [
        '# Effect Parameters (generated)',
        '',
        "Auto-generated from the 13 frozen EffectDefinitions. Source of truth: each example's `parameters.json` (E01: `src/parameters.ts` static literal).",
        '',
        '| Example | Name | Version | Parameters | Structure Key |',
        '| --- | --- | --- | --- | --- |',
    ];
    for (const { id, definition, sourceIdentity } of defs) {
        const count = Object.keys(definition.params).length;
        const sk = computeStructureKey(definition, undefined, sourceIdentity || {});
        lines.push(`| ${id} | ${definition.name} | ${definition.version} | ${count} | ${sk} |`);
    }
    lines.push('');
    for (const { id, definition } of defs) {
        lines.push(`## ${id} — ${definition.name}`);
        lines.push('');
        lines.push('| Parameter | Type | Default | Range/Enum | Update Mode | Description |');
        lines.push('| --- | --- | --- | --- | --- | --- |');
        for (const [key, p] of Object.entries(definition.params)) {
            const enumList = getEnumList(p);
            const range =
                p.type === 'number' ? `${p.min}–${p.max} step ${p.step}` : enumList ? enumList.join('/') : '—';
            lines.push(
                `| ${key} | ${p.type} | ${JSON.stringify(getDefault(p))} | ${range} | ${normalizeDefinition(definition).params[key].updateMode} | ${p.description || ''} |`,
            );
        }
        lines.push('');
    }
    return lines.join('\n');
}

function renderApi(defs) {
    const lines = [
        '# Effect API Reference (generated)',
        '',
        "This documents the EXISTING native CocosAirJS API and each example's parameter contract.",
        'There is no new unified `createEffect` runtime — each example uses the standard',
        '`createAirApp` / `Material` / `MeshRenderer` / `EffectAsset` pipeline directly.',
        '',
        '## Selected native API surface',
        '',
        '- `createAirApp({ canvas })` — application bootstrap',
        '- `Scene` / `Node` / `Camera` — scene graph',
        '- `MeshRenderer` + `utils.createMesh(...)` — full-screen quad rendering',
        '- `Material.initialize({ effectAsset, defines, states })` — material setup',
        '- `Material.setProperty(name, value)` — uniform upload',
        '- `EffectAsset` — registered effect definitions',
        '- `createAirRenderTarget(...)` — render targets (multi-pass compositions)',
        '- `createStepClock()` — deterministic test stepping',
        '',
        '## Per-example pass counts (native rendering passes per frame)',
        '',
        '| Example | Passes |',
        '| --- | --- |',
    ];
    for (const { id } of defs) {
        lines.push(`| ${id} | ${PASS_COUNTS[id] || 1} |`);
    }
    lines.push('', '## Per-example source-attested API claims', '');
    for (const { id, apiClaims } of defs)
        lines.push(
            `- ${id}: ${(apiClaims || []).map((x) => '`' + x + '`').join(', ') || 'No source attestation supplied.'}`,
        );
    lines.push('');
    lines.push('## Per-example parameter interfaces');
    lines.push('');
    lines.push('See [shaders-effect-params.d.ts](../../../tools/generated/shaders-effect-params.d.ts) for the');
    lines.push('full TypeScript interfaces generated from each definition.');
    lines.push('');
    lines.push('## Composition patterns');
    lines.push('');
    lines.push('| Pattern | Examples |');
    lines.push('| --- | --- |');
    lines.push('| Single-pass native | E01–E04, E06–E08, C02 |');
    lines.push('| Two-pass RT composition | E05 Emboss, E09 Glass, C03 GlassTrail; C04 procedural/rendered |');
    lines.push(
        '| Multi-pass composition | C01 LaserCard (3-pass), C02 FilmNeon, C03 GlassTrail, C04 InputDissolve (3-route) |',
    );
    lines.push('');
    return lines.join('\n');
}

function renderAgent(defs) {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const lines = [
        '# Agent Reference: Shader Effects (generated)',
        '',
        'This is a reference for AI agents working with the CocosAirJS shader examples.',
        'It lists the public SDK API, example parameter contracts, and usage patterns.',
        '',
        '## Quick start',
        '',
        '```typescript',
        `import { createAirApp, Scene, Camera, Node, MeshRenderer, Material } from '${pkg.name}';`,
        '```',
        '',
        '## Available examples',
        '',
        '| ID | Example | Description |',
        '| --- | --- | --- |',
    ];
    for (const { id, definition, dir } of defs) {
        lines.push(`| ${id} | [${definition.name}](../../../examples/${dir}/) | ${definition.version} |`);
    }
    lines.push('');
    lines.push('## Parameter contracts');
    lines.push('');
    lines.push('Each example exposes its parameters through a frozen `parameters.json` contract');
    lines.push('(E01 NoiseDissolve uses a static TypeScript literal in `src/parameters.ts`).');
    lines.push('See [parameters table](shaders-effect-parameters.md) for the full list.');
    lines.push('');
    lines.push('## Verification status');
    lines.push('');
    lines.push(
        '- Engine status is evaluated separately; see [current SDK delivery](../current-sdk-refresh-delivery.md). This generator does not validate those Gates.',
    );
    lines.push('- Agent Gate: NOT_RUN (requires separate isolated benchmark).');
    lines.push('- This reference is generated from definitions — it does not substitute for browser verification.');
    lines.push('');
    return lines.join('\n');
}

function renderValidation(defs) {
    const meta = {
        schemaVersion: 'shaders-effect-validation-metadata/1',
        generated: 'tools/examples/shaders-effect-docs.cjs',
        sourceOfTruth: 'EffectDefinition (12 parameters.json + 1 static TS literal)',
        toolchain: {
            node: process.versions.node,
            typescript: ts.version,
            prettier: require('prettier/package.json').version,
        },
        documented: defs.map(({ id }) => id),
        cataloged: defs.map(({ id }) => id),
        implemented: defs.map(({ id }) => id),
        engineVerified: [],
        agentVerified: [],
        stable: [],
        engineGateStatus: 'NOT_EVALUATED_BY_THIS_TOOL',
        runtimeIdentityPolicy:
            'Runtime bundle bytes are bound by Engine collectors; documentation binds the SDK declarations it consumes.',
        generatorIdentity: [
            'tools/examples/shaders-effect-docs.cjs',
            'tools/verify/shaders-effect-contract.cjs',
            'tools/verify/shaders-api-evidence.cjs',
            'tools/examples/spec-evidence.cjs',
            '.prettierrc.json',
            '.editorconfig',
            '.prettierignore',
            'package.json',
            'build/cocosair.module.d.ts',
        ].map((file) => fingerprint(ROOT, file)),
        gates: {
            wave1: 'docs/evidence/shaders-absorption/wave1-current-sdk-r2-gate.json',
            wave2: 'docs/evidence/shaders-absorption/wave2-current-sdk-r3-gate.json',
            wave3: 'docs/evidence/shaders-absorption/wave3-current-sdk-r2-gate.json',
            wave4: 'docs/evidence/shaders-absorption/wave4-current-sdk-r2-gate.json',
        },
        structureKeys: Object.fromEntries(
            defs.map(({ id, definition, sourceIdentity }) => [
                id,
                computeStructureKey(definition, undefined, sourceIdentity || {}),
            ]),
        ),
        effects: defs.map(({ id, definition, dir, source, sourceIdentity }) => ({
            id,
            name: definition.name,
            version: definition.version,
            directory: `examples/${dir}/`,
            source,
            sourceIdentity,
            adaptations: {
                sourceSchema: definition.schemaVersion || definition.schema || 'implicit legacy contract',
                defaultAlias: Object.values(definition.params).some((p) => own(p, 'default')),
                enumAlias: Object.values(definition.params).some((p) => own(p, 'values')),
                conditionalVariantPolicy: 'variant-or-uniform conservatively enters pipeline key',
                legacyRoutePolicy:
                    id === 'C04' ? 'route structure; other omitted modes uniform (read-only time retained)' : null,
            },
            paramCount: Object.keys(definition.params).length,
            structureKey: computeStructureKey(definition, undefined, sourceIdentity || {}),
            passes: PASS_COUNTS[id] || 1,
        })),
    };
    return JSON.stringify(meta, null, 4) + '\n';
}

function renderAll(defs) {
    const artifacts = {
        [GENERATED.types]: renderTypes(defs),
        [GENERATED.api]: renderApi(defs),
        [GENERATED.parameters]: renderParameters(defs),
        [GENERATED.agent]: renderAgent(defs),
        [GENERATED.validation]: renderValidation(defs),
    };
    // Prettier v3 is async. One isolated Node subprocess keeps the public renderer synchronous.
    const formatter = `const fs=require('node:fs'),p=require('prettier');
        (async()=>{const input=JSON.parse(fs.readFileSync(0,'utf8')),out={};
        for(const [file,text] of Object.entries(input)){
        const config=await p.resolveConfig(file,{editorconfig:true});
        out[file]=await p.format(text,{...config,filepath:file});}
        process.stdout.write(JSON.stringify(out));})().catch(e=>{console.error(e);process.exitCode=1;});`;
    return JSON.parse(
        cp.execFileSync(process.execPath, ['-e', formatter], {
            cwd: ROOT,
            input: JSON.stringify(artifacts),
            encoding: 'utf8',
            windowsHide: true,
            maxBuffer: 16 * 1024 * 1024,
        }),
    );
}

function loadDefinitions(options = {}) {
    const root = options.root || ROOT;
    const out = [];
    for (const ex of EXAMPLES) {
        const base = path.join(root, 'examples', ex.dir);
        let definition;
        if (ex.source === 'parameters.json') {
            definition = JSON.parse(fs.readFileSync(path.join(base, 'parameters.json'), 'utf8'));
        } else {
            const src = fs.readFileSync(path.join(base, 'src', ex.source), 'utf8');
            definition = extractTsLiteral(src);
        }
        const errors = validateDefinitionShape(definition);
        if (errors.length) throw new Error(`${ex.id} ${ex.dir}: ${errors.join('; ')}`);
        const sourcePath = `examples/${ex.dir}/${ex.source === 'parameters.ts' ? 'src/' : ''}${ex.source}`;
        const sourceIdentity = [
            sourcePath,
            `examples/${ex.dir}/src/parameters.ts`,
            `examples/${ex.dir}/src/main.ts`,
            `examples/${ex.dir}/example.json`,
            'build/cocosair.module.d.ts',
            'docs/example-api-inventory.json',
        ]
            .filter((x, i, all) => all.indexOf(x) === i)
            .map((file) => fingerprint(root, file));
        const spec = JSON.parse(fs.readFileSync(path.join(base, 'example.json'), 'utf8'));
        out.push({
            id: ex.id,
            dir: ex.dir,
            source: ex.source,
            definition,
            sourceIdentity,
            apiClaims: spec.api?.claims || [],
        });
    }
    return out;
}

function check(options = {}) {
    const root = options.root || ROOT;
    const defs = loadDefinitions(options);
    const artifacts = renderAll(defs);
    const errors = [];
    for (const [file, expected] of Object.entries(artifacts)) {
        const abs = path.join(options.outputRoot || root, file);
        if (!fs.existsSync(abs)) {
            errors.push(`missing: ${file}`);
            continue;
        }
        const actual = fs.readFileSync(abs, 'utf8');
        if (actual !== expected) errors.push(`drift: ${file}`);
    }
    errors.push(...checkSourceContracts(defs, options));
    return { ok: errors.length === 0, errors };
}

function write(options = {}) {
    const root = options.root || ROOT;
    const defs = loadDefinitions(options);
    const artifacts = renderAll(defs);
    const contractErrors = checkSourceContracts(defs, options);
    if (contractErrors.length) throw new Error('Source contract failures: ' + contractErrors.join('; '));
    for (const [file, content] of Object.entries(artifacts)) {
        const abs = path.join(options.outputRoot || root, file);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content);
    }
    return { ok: true, written: Object.keys(artifacts).length, files: Object.keys(artifacts) };
}

function main(args = process.argv.slice(2)) {
    if (args.length !== 1 || !['--write', '--check'].includes(args[0])) return 2;
    if (args.includes('--check')) {
        const result = check();
        console.log(JSON.stringify(result, null, 2));
        return result.ok ? 0 : 1;
    }
    if (args.includes('--write')) {
        const result = write();
        console.log(JSON.stringify(result, null, 2));
        return 0;
    }
    console.error('Usage: node shaders-effect-docs.cjs --write|--check');
    return 1;
}

module.exports = {
    EXAMPLES,
    GENERATED,
    extractTsLiteral,
    parameterKeys,
    normalizeDefinition,
    loadDefinitions,
    validateDefinitionShape,
    computeStructureKey,
    renderAll,
    checkSourceContracts,
    check,
    write,
    main,
};
if (require.main === module) {
    try {
        process.exitCode = main();
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
}
