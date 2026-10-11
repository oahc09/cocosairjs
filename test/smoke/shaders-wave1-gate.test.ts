import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const gate = require('../../tools/verify/shaders-wave1-gate.cjs');
const { observedIsolation } = require('../../tools/verify/shaders-thin-film-evidence.cjs');

describe('Thin Film isolation receipt migration (NODE_CONTRACT)', () => {
    const legacy = { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' };
    const delivered = { coop: 'same-origin', coep: 'require-corp' };
    test('accepts either actual legacy headers or current HTTP proxy headers', () => {
        expect(observedIsolation({ status: 200, observedHeaders: legacy })).toBe(true);
        expect(observedIsolation({ status: 200, deliveredHeaders: delivered })).toBe(true);
        expect(observedIsolation({ status: 200, observedHeaders: legacy, deliveredHeaders: delivered })).toBe(true);
    });
    test.each([
        null,
        {},
        { status: 200 },
        { status: 404, deliveredHeaders: delivered },
        { status: 200, deliveredHeaders: { ...delivered, coep: 'unsafe-none' } },
        {
            status: 200,
            observedHeaders: { ...legacy, 'cross-origin-opener-policy': 'unsafe-none' },
            deliveredHeaders: delivered,
        },
    ])('rejects missing, incorrect or contradictory HTTP isolation: %j', (value) => {
        expect(observedIsolation(value)).toBe(false);
    });
    test('validator dependency closure rejects missing and drifted implementation', () => {
        const inputs = gate.VALIDATOR_INPUTS.map(gate.identity);
        expect(gate.validateValidatorInputs(inputs)).toEqual([]);
        expect(gate.validateValidatorInputs(inputs.slice(1)).length).toBeGreaterThan(0);
        inputs.find((v: any) => v.path.endsWith('shaders-thin-film-evidence.cjs')).sha256 = '0'.repeat(64);
        expect(gate.validateValidatorInputs(inputs).length).toBeGreaterThan(0);
    });
});

describe('Wave 1 current gate binding contracts (NODE_CONTRACT)', () => {
    let directory: string;
    let bindings: any[];
    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shader-wave1-'));
        bindings = gate.IDS.map((id: string) => {
            const file = path.join(directory, id + '.json');
            fs.writeFileSync(file, JSON.stringify({ id, method: 'NODE_CONTRACT' }));
            return { id, ...gate.identity(file) };
        });
    });
    afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

    test('seven real files with matching identities are read; this alone is not Wave PASS', () => {
        const result = gate.validateBindings(bindings);
        expect(result.errors).toEqual([]);
        expect(Object.keys(result.reports)).toEqual(gate.IDS);
        expect(gate.evaluate(bindings).ok).toBe(false);
    });

    test.each(['missing', 'duplicate', 'SHA', 'bytes', 'invalid-json', 'missing-file'])(
        '%s binding rejects',
        (mutation) => {
            if (mutation === 'missing') bindings.pop();
            if (mutation === 'duplicate') bindings[1] = bindings[0];
            if (mutation === 'SHA') bindings[0].sha256 = '0'.repeat(64);
            if (mutation === 'bytes') bindings[0].bytes++;
            if (mutation === 'invalid-json') {
                const file = path.resolve(process.cwd(), bindings[0].path);
                fs.writeFileSync(file, '{');
                bindings[0] = { id: bindings[0].id, ...gate.identity(file) };
            }
            if (mutation === 'missing-file') fs.unlinkSync(path.resolve(process.cwd(), bindings[0].path));
            expect(gate.validateBindings(bindings).errors.length).toBeGreaterThan(0);
        },
    );

    test('malformed objects cannot advance a Wave', () => {
        for (const value of [
            null,
            undefined,
            [],
            {},
            'PASS',
            { schemaVersion: 'shaders-wave1-current-gate/1', wave: 1 },
        ]) {
            expect(gate.validateReport(value).ok).toBe(false);
        }
    });
});
