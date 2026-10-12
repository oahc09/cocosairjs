// NODE_CONTRACT: all writes and deliberate corruption remain in os.tmpdir().
import type {} from 'jest';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const ts = require('typescript');
const tool = require('../../tools/examples/shaders-effect-docs.cjs');
const ROOT = path.resolve(__dirname, '../..');
let sandbox: string;
let outputRoot: string;
let defs: any[];

beforeAll(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'air-wave5-docs-'));
    outputRoot = path.join(sandbox, 'generated');
    defs = tool.loadDefinitions();
    const sources = new Set(defs.flatMap((d: any) => d.sourceIdentity.map((f: any) => f.path)));
    for (const file of sources) {
        const target = path.join(sandbox, file as string);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(ROOT, file as string), target);
    }
    tool.write({ root: sandbox, outputRoot });
}, 30000);
afterAll(() => {
    const resolved = path.resolve(sandbox);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('air-wave5-docs-'))
        throw new Error('Unsafe temporary cleanup target');
    fs.rmSync(resolved, { recursive: true, force: true });
});

function cloned() {
    return JSON.parse(JSON.stringify(defs[1].definition));
}
function mutateSource(relative: string, edit: (source: string) => string, action: () => void) {
    const file = path.join(sandbox, relative);
    const original = fs.readFileSync(file, 'utf8');
    try {
        fs.writeFileSync(file, edit(original));
        action();
    } finally {
        fs.writeFileSync(file, original);
    }
}

describe('Wave5 generation contracts', () => {
    test('all thirteen actual sources and API contracts pass', () => {
        expect(defs.map((d: any) => d.id)).toEqual([
            'E01',
            'E02',
            'E03',
            'E04',
            'E05',
            'E06',
            'E07',
            'E08',
            'E09',
            'C01',
            'C02',
            'C03',
            'C04',
        ]);
        expect(tool.checkSourceContracts(defs)).toEqual([]);
    });
    test('write and read-only check use an isolated output directory', () => {
        expect(tool.check({ root: sandbox, outputRoot })).toEqual({ ok: true, errors: [] });
    });
    test('second generation is byte-identical in all five artifacts', () => {
        const before = Object.values(tool.GENERATED).map((f: any) => fs.readFileSync(path.join(outputRoot, f)));
        tool.write({ root: sandbox, outputRoot });
        expect(
            Object.values(tool.GENERATED).map((f: any, i) =>
                fs.readFileSync(path.join(outputRoot, f)).equals(before[i]),
            ),
        ).toEqual([true, true, true, true, true]);
    });
    test('changed output bytes fail without repairing them', () => {
        const file = path.join(outputRoot, tool.GENERATED.types);
        const bytes = fs.readFileSync(file);
        try {
            fs.appendFileSync(file, '\n// drift');
            expect(tool.check({ root: sandbox, outputRoot }).ok).toBe(false);
            expect(fs.readFileSync(file, 'utf8').endsWith('// drift')).toBe(true);
        } finally {
            fs.writeFileSync(file, bytes);
        }
    });
    test('missing output fails without recreating it', () => {
        const file = path.join(outputRoot, tool.GENERATED.api);
        const bytes = fs.readFileSync(file);
        try {
            fs.unlinkSync(file);
            expect(tool.check({ root: sandbox, outputRoot }).ok).toBe(false);
            expect(fs.existsSync(file)).toBe(false);
        } finally {
            fs.writeFileSync(file, bytes);
        }
    });
    test.each([
        'export const definition = {a: [1, -2,], b: true,} as const;',
        'export const definition = {/* brace } */a: "escaped\\nline",};',
    ])('AST accepts TS literals, comments, escapes and trailing commas: %s', (source) => {
        const parsed = tool.extractTsLiteral(source);
        expect(parsed.a).toEqual(source.includes('[1') ? [1, -2] : 'escaped\nline');
    });
    test.each([
        '{a: Math.random()}',
        '{...other}',
        '{get a(){return 1}}',
        '{a: missing}',
        '{a: `${value}`}',
        '{["a"]: 1}',
        '{a: 1, a: 2}',
        '{a: [1,,2]}',
        '{a: 1 + 2}',
    ])('AST rejects executable or ambiguous initializer %s', (body) => {
        expect(() => tool.extractTsLiteral(`export const definition = ${body} as const;`)).toThrow();
    });
    test('accessor is rejected without calling it', () => {
        const d = cloned();
        let reads = 0;
        Object.defineProperty(d.params.shape, 'defaultValue', {
            enumerable: true,
            get: () => {
                reads++;
                return 'circle';
            },
        });
        expect(tool.validateDefinitionShape(d).length).toBeGreaterThan(0);
        expect(reads).toBe(0);
    });
    test('cycle rejects without throwing', () => {
        const d = cloned();
        d.params.shape.extra = d;
        expect(tool.validateDefinitionShape(d).length).toBeGreaterThan(0);
    });
    test('unknown schema is rejected', () => {
        const d = cloned();
        d.schemaVersion = 'unknown/1';
        expect(tool.validateDefinitionShape(d).length).toBeGreaterThan(0);
    });
    test('conflicting enum aliases reject', () => {
        const d = cloned();
        d.params.shape.values = ['circle'];
        expect(tool.validateDefinitionShape(d).length).toBeGreaterThan(0);
    });
    test('invalid actual structural value rejects instead of hashing', () => {
        expect(() => tool.computeStructureKey(cloned(), { shape: 'bogus' })).toThrow();
    });
    test('C04 route enters structure key; E09 conditional variants are conservatively pipeline', () => {
        const c04 = tool.normalizeDefinition(defs[12].definition);
        const defaults = Object.fromEntries(Object.entries(c04.params).map(([k, p]: any) => [k, p.defaultValue]));
        expect(tool.computeStructureKey(c04, defaults)).not.toBe(
            tool.computeStructureKey(c04, { ...defaults, route: 'rendered' }),
        );
        const glass = tool.normalizeDefinition(defs[8].definition);
        expect(glass.params.blur.updateMode).toBe('pipeline');
    });
    test('definition and source identity both affect structure key', () => {
        const a = cloned(),
            b = cloned();
        b.version = '2';
        expect(tool.computeStructureKey(a)).not.toBe(tool.computeStructureKey(b));
        expect(tool.computeStructureKey(a, undefined, { source: 'a' })).not.toBe(
            tool.computeStructureKey(a, undefined, { source: 'b' }),
        );
    });
    test('source parameter key in a comment cannot replace a missing property', () => {
        mutateSource(
            'examples/shader-neon/src/parameters.ts',
            (s) => s.replace('    tubeThickness: number;', '    // tubeThickness: number;'),
            () => {
                expect(
                    tool
                        .checkSourceContracts(defs, { root: sandbox })
                        .some((e: string) => e.includes('exact parameter keys')),
                ).toBe(true);
            },
        );
    });
    test('extra actual source parameter rejects', () => {
        mutateSource(
            'examples/shader-neon/src/parameters.ts',
            (s) => s.replace('export interface NeonParams {', 'export interface NeonParams { ghost: number;'),
            () => {
                expect(
                    tool
                        .checkSourceContracts(defs, { root: sandbox })
                        .some((e: string) => e.includes('exact parameter keys')),
                ).toBe(true);
            },
        );
    });
    test('public API claim without a SDK symbol rejects', () => {
        mutateSource(
            'examples/shader-neon/example.json',
            (s) => {
                const x = JSON.parse(s);
                x.api.claims.push('MadeUpAPI');
                return JSON.stringify(x);
            },
            () => {
                expect(
                    tool
                        .checkSourceContracts(defs, { root: sandbox })
                        .some((e: string) => e.includes('unknown public SDK API')),
                ).toBe(true);
            },
        );
    });
    test('API executable source line drift rejects', () => {
        mutateSource(
            'examples/shader-neon/example.json',
            (s) => {
                const x = JSON.parse(s);
                x.api.evidence[0].sourceLocation = 'L1';
                return JSON.stringify(x);
            },
            () => {
                expect(
                    tool
                        .checkSourceContracts(defs, { root: sandbox })
                        .some((e: string) => e.includes('source line mismatch')),
                ).toBe(true);
            },
        );
    });
    test('SDK declaration drift invalidates API inventory', () => {
        mutateSource(
            'build/cocosair.module.d.ts',
            (s) => s + '\n// drift',
            () => {
                expect(
                    tool
                        .checkSourceContracts(defs, { root: sandbox })
                        .some((e: string) => e.includes('SDK fingerprint drift')),
                ).toBe(true);
            },
        );
    });
    test('source definition mutation invalidates generated bytes', () => {
        mutateSource(
            'examples/shader-neon/parameters.json',
            (s) => {
                const d = JSON.parse(s);
                d.params.intensity.defaultValue = 0.75;
                return JSON.stringify(d);
            },
            () => {
                expect(tool.check({ root: sandbox, outputRoot }).ok).toBe(false);
            },
        );
    });
    test('CLI rejects conflicting modes before writing', () => {
        expect(tool.main(['--write', '--check'])).toBe(2);
    });
    test('strict real TS consumer accepts all thirteen interfaces and rejects an invalid enum', () => {
        const types = path.join(outputRoot, tool.GENERATED.types).replace(/\\/g, '/');
        const rendered = fs.readFileSync(types, 'utf8');
        const ast = ts.createSourceFile(types, rendered, 99, true);
        const interfaces = ast.statements.filter((s: any) => ts.isInterfaceDeclaration(s));
        expect(interfaces).toHaveLength(13);
        const lines = [`import type * as T from '${types.slice(0, -5)}';`];
        interfaces.forEach((s: any, i: number) => {
            const d = tool.normalizeDefinition(defs[i].definition);
            const values = Object.fromEntries(Object.entries(d.params).map(([k, p]: any) => [k, p.defaultValue]));
            lines.push(`const p${i}: T.${s.name.text} = ${JSON.stringify(values)};`);
        });
        const sdk = path.join(ROOT, 'build/cocosair.module.d.ts').replace(/\\/g, '/');
        lines.push(`import {createAirApp} from '${sdk.slice(0, -5)}'; const boot: typeof createAirApp = createAirApp;`);
        const consumer = path.join(sandbox, 'consumer.ts');
        const tsc = path.join(ROOT, 'node_modules/typescript/bin/tsc');
        const run = () =>
            cp.spawnSync(
                process.execPath,
                [tsc, '--strict', '--noEmit', '--skipLibCheck', '--target', 'ES2022', '--module', 'commonjs', consumer],
                { encoding: 'utf8', windowsHide: true },
            );
        fs.writeFileSync(consumer, lines.join('\n'));
        const accepted = run();
        expect({ code: accepted.status, errors: accepted.stdout }).toEqual({ code: 0, errors: '' });
        fs.appendFileSync(consumer, `\nconst invalid: T.${interfaces[1].name.text}['shape'] = 'bogus';`);
        const rejected = run();
        expect(rejected.status).toBe(2);
        expect(rejected.stdout).toMatch(/TS2322/);
    }, 30000);
});
