// Lead review: read-only production checks. These tests never rewrite canonical artifacts.
import type {} from 'jest';
const fs = require('node:fs');
const path = require('node:path');
const tool = require('../../tools/examples/shaders-effect-docs.cjs');
const ROOT = path.resolve(__dirname, '../..');

function definition() {
    return {
        schemaVersion: 'shaders-effect-contract/1',
        name: 'review-effect',
        version: '1',
        params: {
            shape: {
                type: 'string',
                enum: ['circle', 'box'],
                defaultValue: 'circle',
                updateMode: 'structure',
                description: 'Geometry variant',
            },
            intensity: {
                type: 'number',
                defaultValue: 0.5,
                min: 0,
                max: 1,
                step: 0.1,
                updateMode: 'uniform',
                description: 'Light intensity',
            },
        },
    };
}

describe('Wave5 docs Lead review: independent data contracts', () => {
    test('valid fixture is actually accepted', () => {
        expect(tool.validateDefinitionShape(definition())).toEqual([]);
    });
    test.each(['min', 'max', 'step'])('non-finite %s is rejected', (field) => {
        const d = definition();
        (d.params.intensity as any)[field] = field === 'min' ? NaN : Infinity;
        expect(tool.validateDefinitionShape(d).length).toBeGreaterThan(0);
    });
    test('out-of-range default is rejected', () => {
        const d = definition();
        d.params.intensity.defaultValue = 2;
        expect(tool.validateDefinitionShape(d).length).toBeGreaterThan(0);
    });
    test('duplicate enum entries are rejected', () => {
        const d = definition();
        d.params.shape.enum = ['circle', 'circle'];
        expect(tool.validateDefinitionShape(d).length).toBeGreaterThan(0);
    });
    test('conflicting default aliases are rejected', () => {
        const d = definition();
        (d.params.intensity as any).default = 0.75;
        expect(tool.validateDefinitionShape(d).length).toBeGreaterThan(0);
    });
    test('arrays with descriptor properties are not plain definitions', () => {
        const disguised = Object.assign([], definition());
        expect(tool.validateDefinitionShape(disguised).length).toBeGreaterThan(0);
    });
    test('changing a structural value changes the key for the same definition', () => {
        const d = definition();
        expect(tool.computeStructureKey(d, { shape: 'circle', intensity: 0.5 })).not.toBe(
            tool.computeStructureKey(d, { shape: 'box', intensity: 0.5 }),
        );
    });
    test('changing only a uniform preserves the key', () => {
        const d = definition();
        expect(tool.computeStructureKey(d, { shape: 'circle', intensity: 0.1 })).toBe(
            tool.computeStructureKey(d, { shape: 'circle', intensity: 0.9 }),
        );
    });
    test('TS extraction is available as a literal-only parser and never executes calls', () => {
        expect(typeof tool.extractTsLiteral).toBe('function');
        expect(() => tool.extractTsLiteral('export const definition = { name: (() => 42)() } as const;')).toThrow();
        expect(tool.extractTsLiteral("export const definition = { name: 'brace } inside', n: -1 } as const;")).toEqual({
            name: 'brace } inside',
            n: -1,
        });
    });
    test('rendering definitions alone cannot award engine verification', () => {
        const rendered = tool.renderAll([
            { id: 'REVIEW', dir: 'review-effect', source: 'parameters.json', definition: definition() },
        ]);
        const metadata = JSON.parse(rendered[tool.GENERATED.validation]);
        expect(metadata.engineVerified).toEqual([]);
        expect(metadata.agentVerified).toEqual([]);
        expect(metadata.stable).toEqual([]);
    });
    test('documentation binds consumed SDK declarations and does not read runtime build stamps', () => {
        const defs = tool.loadDefinitions();
        const original = fs.readFileSync;
        const runtimeReads: string[] = [];
        const spy = jest.spyOn(fs, 'readFileSync').mockImplementation((file: any, ...args: any[]) => {
            const normalized = String(file).replace(/\\/g, '/');
            if (/\/build\/(?:npm\/)?cocosair\.module\.js$/.test(normalized)) runtimeReads.push(normalized);
            return original(file, ...args);
        });
        let metadata: any;
        try {
            metadata = JSON.parse(tool.renderAll(defs)[tool.GENERATED.validation]);
        } finally {
            spy.mockRestore();
        }
        expect(runtimeReads).toEqual([]);
        expect(metadata.generatorIdentity.some((x: any) => x.path === 'build/cocosair.module.d.ts')).toBe(true);
        expect(metadata.generatorIdentity.some((x: any) => /cocosair\.module\.js$/.test(x.path))).toBe(false);
        expect(metadata.engineVerified).toEqual([]);
        expect(metadata.engineGateStatus).toBe('NOT_EVALUATED_BY_THIS_TOOL');
    });
    test('alternative default fields survive parameter and type documentation', () => {
        const defs = tool.loadDefinitions();
        const c04 = defs.find((d: any) => d.id === 'C04');
        const rendered = tool.renderAll([c04]);
        expect(rendered[tool.GENERATED.parameters]).not.toMatch(/\| undefined \|/);
        expect(rendered[tool.GENERATED.types]).not.toMatch(/Default: undefined/);
    });
    test('Agent reference imports the actual npm package name', () => {
        const rendered = tool.renderAll(tool.loadDefinitions());
        const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
        const match = rendered[tool.GENERATED.agent].match(/from ['"]([^'"]+)['"]/);
        expect(match && match[1]).toBe(pkg.name);
    });
    test('generated local links resolve from the generated document location', () => {
        const rendered = tool.renderAll(tool.loadDefinitions());
        const broken: string[] = [];
        for (const file of [tool.GENERATED.api, tool.GENERATED.agent]) {
            for (const match of rendered[file].matchAll(/\]\(([^)]+)\)/g)) {
                const target = match[1];
                if (/^(https?:|#)/.test(target)) continue;
                const absolute = path.resolve(ROOT, path.dirname(file), target.split('#')[0]);
                if (!fs.existsSync(absolute)) broken.push(`${file}: ${target}`);
            }
        }
        expect(broken).toEqual([]);
    });
});
