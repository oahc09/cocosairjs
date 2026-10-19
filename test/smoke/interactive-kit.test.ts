const fs = require('fs'),
    os = require('os'),
    path = require('path'),
    crypto = require('crypto'),
    { PNG } = require('pngjs');
const { checkRow, visiblePixels } = require('../../tools/verify/interactive-kit-evidence.cjs');
describe('installed recipe focused acceptance (synthetic PNG contract only)', () => {
    let dir: string, row: any;
    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ier-kit-contract-'));
        const png = new PNG({ width: 16, height: 16 });
        for (let i = 0; i < png.data.length; i += 4) {
            png.data[i] = 230;
            png.data[i + 3] = 255;
        }
        const bytes = PNG.sync.write(png),
            file = path.join(dir, 'red.png');
        fs.writeFileSync(file, bytes);
        const record = {
            path: file,
            bytes: bytes.length,
            sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        };
        row = {
            id: 'interactive-input',
            engine: 'chromium',
            version: 'contract',
            pageErrors: [],
            consoleErrors: [],
            buildRequests: [],
            fallbackRequests: [],
            runtimeRequested: true,
            states: ['initial', 'input', 'reset', 'resize'].map((phase, i) => ({
                phase,
                png: record,
                canvasRect: { left: 0, top: 0, width: 16, height: 16 },
                observationTimestamp: '2026-10-08T00:00:00Z',
                snapshot: {
                    activations: i ? 1 : 0,
                    visibleUpdates: i ? 1 : 0,
                    actor: { x: i ? 0.25 : 0 },
                    generation: i > 1 ? 2 : 1,
                },
            })),
            release: {
                samePromise: true,
                receipt: { refs: [{ before: 1, after: 0 }], disposed: true, inputDetached: true },
            },
        };
    });
    afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
    test('accepts real decode and corresponding model/reset/ownership receipts', () =>
        expect(checkRow(row)).toEqual({ pass: true, errors: [] }));
    test.each(['model', 'refs', 'trust-path', 'png', 'missing-state'])(
        'rejects %s mutation without trusting self-reported PASS',
        (name) => {
            const c = JSON.parse(JSON.stringify(row));
            if (name === 'model') c.states[1].snapshot.activations = 0;
            if (name === 'refs') c.release.receipt.refs[0].after = 1;
            if (name === 'trust-path') c.fallbackRequests.push('/build/module.js');
            if (name === 'png') c.states[0].png.sha256 = '0'.repeat(64);
            if (name === 'missing-state') c.states.pop();
            expect(checkRow(c).pass).toBe(false);
        },
    );
    test('cannot use page label pixels outside the canvas as visible geometry', () => {
        const bytes = fs.readFileSync(row.states[0].png.path);
        expect(visiblePixels(bytes, { left: 20, top: 20, width: 16, height: 16 })).toBe(0);
        expect(() => visiblePixels(bytes, { left: 0, top: 0, width: NaN, height: 16 })).toThrow('invalid canvas rect');
    });
});

const { contents } = require('../../tools/examples/interactive-kit.cjs');
const {
    checkInstalledIdentity,
    checkReport,
    selectedEngines,
} = require('../../tools/verify/interactive-kit-evidence.cjs');
const repository = path.resolve(__dirname, '../..');
const identity = (file: string) => {
    const bytes = fs.readFileSync(path.join(repository, file));
    return { bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
};
describe('source-copy versus installed-runtime identities', () => {
    test('copies both shared lifecycle dependencies byte for byte', () => {
        const files = contents(),
            manifest = JSON.parse(files.get('manifest.json'));
        expect(manifest.schemaVersion).toBe('interactive-consumer-kit/2');
        for (const name of ['asset-lifecycle.js', 'asset-lifecycle.d.ts']) {
            expect(
                files.get('shared/' + name).equals(fs.readFileSync(path.join(repository, 'examples/shared', name))),
            ).toBe(true);
            expect(
                manifest.sources.some(
                    (s: any) => s.path === 'examples/shared/' + name && s.kitPath === 'shared/' + name,
                ),
            ).toBe(true);
        }
    });
    test('runtime byte changes do not become source-copy drift', () => {
        const before = contents().get('manifest.json');
        const read = fs.readFileSync;
        const spy = jest.spyOn(fs, 'readFileSync').mockImplementation((file: any, ...args: any[]) => {
            if (String(file).startsWith(path.join(repository, 'build') + path.sep))
                return Buffer.from('different runtime');
            return read(file, ...args);
        });
        try {
            expect(contents().get('manifest.json').equals(before)).toBe(true);
        } finally {
            spy.mockRestore();
        }
    });
    test('shared source drift changes the copied manifest', () => {
        const before = contents().get('manifest.json'),
            read = fs.readFileSync;
        const spy = jest.spyOn(fs, 'readFileSync').mockImplementation((file: any, ...args: any[]) => {
            if (String(file) === path.join(repository, 'examples/shared/asset-lifecycle.js'))
                return Buffer.from('changed source');
            return read(file, ...args);
        });
        try {
            expect(contents().get('manifest.json').equals(before)).toBe(false);
        } finally {
            spy.mockRestore();
        }
    });
    const receipt = () => ({
        defaultsBefore: { 'build/npm/cocosair.module.js': identity('build/npm/cocosair.module.js') },
        installedRuntime: identity('build/npm/cocosair.module.js'),
        installedPackage: identity('package.json'),
        packageEntry: {
            requested: 'cocosair.js',
            resolved: 'build/npm/cocosair.module.js',
            exportTarget: JSON.parse(fs.readFileSync(path.join(repository, 'package.json'))).exports['.'].import,
        },
        installedRuntimeMaps: [],
        typecheck: {
            version: '4.9.5',
            exitCode: 0,
            installedDeclarationsOnly: true,
            declaration: { path: 'build/cocosair.legacy.d.ts', ...identity('build/cocosair.legacy.d.ts') },
        },
    });
    test('runtime identity must independently match actual current bytes', () =>
        expect(checkInstalledIdentity(receipt())).toEqual({ pass: true, errors: [] }));
    test.each([
        ['runtime', (r: any) => (r.installedRuntime.sha256 = '0'.repeat(64))],
        ['types', (r: any) => (r.typecheck.declaration.sha256 = '0'.repeat(64))],
        ['legacy routing', (r: any) => (r.typecheck.declaration.path = 'build/cocosair.module.d.ts')],
        ['package', (r: any) => (r.installedPackage.sha256 = '0'.repeat(64))],
        ['exports', (r: any) => (r.packageEntry.exportTarget = './fake.js')],
        ['runtime map', (r: any) => (r.installedRuntimeMaps = ['cocosair.module.js.map'])],
    ])('rejects forged %s identity', (_name, change: any) => {
        const r = receipt();
        change(r);
        expect(checkInstalledIdentity(r).pass).toBe(false);
    });
    test('selection is explicit and invalid matrices fail', () => {
        expect(selectedEngines('webkit')).toEqual(['webkit']);
        expect(selectedEngines()).toEqual(['chromium', 'firefox', 'webkit']);
        expect(() => selectedEngines('unknown')).toThrow('browser must be');
        for (const engines of [undefined, [], ['webkit', 'webkit'], ['unknown']])
            expect(checkReport({ engines }, { selected: true }).selectedScopePassed).toBe(false);
    });
});
