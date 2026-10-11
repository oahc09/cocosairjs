/**
 * Gallery lifecycle collector contracts: total validateReport/validateFiles
 * with tmpdir synthetic PNG fixtures. Production checker imported directly.
 * NODE_CONTRACT only — no browser evidence claimed.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { PNG } from 'pngjs';

const {
    checkRow,
    validateReport,
    validateFiles,
    INPUTS,
    comparePNG,
} = require('../../tools/verify/shaders-gallery-lifecycle.cjs');

const ROOT = path.resolve(__dirname, '../..');
let tmp: string;
beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gallery-validator-'));
});
afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
});

function makePNG(width = 640, height = 400, seed = 0): Buffer {
    const png = new PNG({ width, height });
    for (let i = 0; i < width * height; i++) {
        png.data[i * 4] = (seed + i) % 256;
        png.data[i * 4 + 1] = (seed * 2 + i) % 256;
        png.data[i * 4 + 2] = (seed * 3 + i) % 256;
        png.data[i * 4 + 3] = 255;
    }
    return PNG.sync.write(png);
}

function validRow(engine: string, effect: string, mode: string): any {
    return {
        engine,
        effect,
        mode,
        browserVersion: 'test-1.0',
        pageErrors: [],
        consoleErrors: [],
        lifecycle: {
            released: true,
            reloaded: true,
            errors: [],
            leaked: [],
            held: 3,
            retirement: Array.from({ length: 3 }, () => ({ before: 1, after: 0, validAfterSettle: false })),
        },
        samePromise: true,
        before: { instance: 'old-1' },
        after: { instance: 'fresh-2' },
        pixelComparison: { variedPixels: 5000, changedPixels: 0 },
        releaseSamePromise: true,
        terminalHold: 0,
        pageClosed: true,
    };
}

function buildReport(): any {
    return {
        schemaVersion: 'shaders-gallery-lifecycle/1',
        startedAt: '2026-10-10T10:00:00.000Z',
        endedAt: '2026-10-10T10:01:00.000Z',
        command: ['node', 'test'],
        cwd: ROOT,
        exitCode: 0,
        subset: true,
        completed: false,
        waveGate: 'NOT_RUN',
        inputsUnchanged: true,
        cleanup: { pagesClosed: 18, browsersClosed: 3, serverClosed: true },
        rows: ['chromium', 'firefox', 'webkit'].flatMap((e) =>
            ['shader-noise-dissolve', 'shader-thin-film', 'shader-sparkle'].flatMap((f) =>
                ['step', 'native'].map((m) => validRow(e, f, m)),
            ),
        ),
    };
}

describe('gallery lifecycle checkRow: total structured rejection', () => {
    test('null/undefined/string/number/array/empty-object rows are rejected without throwing', () => {
        for (const bad of [null, undefined, 'x', 42, [], {}]) {
            let result: any;
            expect(() => {
                result = checkRow(bad as never);
            }).not.toThrow();
            expect(result.ok).toBe(false);
            expect(Array.isArray(result.errors)).toBe(true);
        }
    });

    test('missing pageErrors/consoleErrors arrays are rejected', () => {
        const row = validRow('chromium', 'shader-thin-film', 'step');
        delete row.pageErrors;
        delete row.consoleErrors;
        const v = checkRow(row);
        expect(v.ok).toBe(false);
        expect(v.errors.some((e: string) => e.includes('pageErrors'))).toBe(true);
        expect(v.errors.some((e: string) => e.includes('consoleErrors'))).toBe(true);
    });

    test('valid row is accepted', () => {
        expect(checkRow(validRow('chromium', 'shader-sparkle', 'native')).ok).toBe(true);
    });

    test('refs after=9 is rejected', () => {
        const row = validRow('chromium', 'shader-sparkle', 'step');
        row.lifecycle.retirement[0].after = 9;
        expect(checkRow(row).ok).toBe(false);
    });

    test('same instance before/after is rejected', () => {
        const row = validRow('chromium', 'shader-sparkle', 'step');
        row.after.instance = row.before.instance;
        expect(checkRow(row).ok).toBe(false);
    });
});

describe('gallery lifecycle validateReport: exact 18 tuples + metadata', () => {
    test('null/undefined/malformed reports are total rejections', () => {
        for (const bad of [null, undefined, 'x', 42, [], {}]) {
            let result: any;
            expect(() => {
                result = validateReport(bad as never);
            }).not.toThrow();
            expect(result.ok).toBe(false);
        }
    });

    test('missing row (rows < 18) is rejected', () => {
        const t = buildReport();
        t.rows.splice(17, 1);
        expect(validateReport(t).ok).toBe(false);
    });

    test('duplicate tuple is rejected', () => {
        const t = buildReport();
        t.rows[1] = JSON.parse(JSON.stringify(t.rows[0]));
        expect(validateReport(t).ok).toBe(false);
    });

    test('empty browserVersion is rejected', () => {
        const t = buildReport();
        t.rows[0].browserVersion = '';
        expect(validateReport(t).ok).toBe(false);
    });

    test('scopePassed=true with errors is contradiction rejected', () => {
        const t = buildReport();
        t.rows[0].lifecycle.released = false; // inject a failure
        t.scopePassed = true; // and claim pass
        const v = validateReport(t);
        expect(v.ok).toBe(false);
        expect(v.errors.some((e: string) => e.includes('scopePassed'))).toBe(true);
    });

    test('waveGate must be NOT_RUN, subset must be true', () => {
        const t = buildReport();
        t.waveGate = 'PASS';
        expect(validateReport(t).ok).toBe(false);
        const t2 = buildReport();
        t2.subset = false;
        expect(validateReport(t2).ok).toBe(false);
    });
});

describe('gallery lifecycle validateFiles: PNG + input identity', () => {
    function fileIdentity(file: string): any {
        const bytes = fs.readFileSync(file);
        return { path: file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
    }

    function completeReport(): any {
        const report = buildReport();
        const before = path.join(tmp, 'before.png');
        const after = path.join(tmp, 'after.png');
        fs.writeFileSync(before, makePNG());
        fs.writeFileSync(after, makePNG());
        report.inputs = INPUTS.map((file: string) => {
            const absolute = path.resolve(ROOT, file);
            return { ...fileIdentity(absolute), path: path.relative(ROOT, absolute).replace(/\\/g, '/') };
        });
        for (const row of report.rows) {
            row.screenshots = [fileIdentity(before), fileIdentity(after)];
            row.pixelComparison = comparePNG(before, after);
        }
        return report;
    }

    test('production validator accepts complete NODE_CONTRACT fixture', () => {
        expect(validateFiles(completeReport())).toEqual({ ok: true, errors: [] });
    });

    test.each([
        'missing-input',
        'input-drift',
        'missing-screenshot',
        'wrong-size',
        'changed-pixels',
        'server-open',
        'fake-pixel-count',
    ])('%s is independently rejected', (mutation) => {
        const report = completeReport();
        if (mutation === 'missing-input') report.inputs.pop();
        if (mutation === 'input-drift') report.inputs[0].sha256 = '0'.repeat(64);
        if (mutation === 'missing-screenshot') delete report.rows[0].screenshots;
        if (mutation === 'server-open') report.cleanup.serverClosed = false;
        if (mutation === 'fake-pixel-count') report.rows[0].pixelComparison.variedPixels = 1001;
        if (mutation === 'wrong-size' || mutation === 'changed-pixels') {
            const changed = path.join(tmp, `${mutation}.png`);
            fs.writeFileSync(changed, mutation === 'wrong-size' ? makePNG(320, 200) : makePNG(640, 400, 15));
            report.rows[0].screenshots[1] = fileIdentity(changed);
        }
        expect(validateFiles(report).ok).toBe(false);
    });
    test('synthetic valid PNG is decodable and correct size', () => {
        const pngFile = path.join(tmp, 'test-640x400.png');
        fs.writeFileSync(pngFile, makePNG());
        const png = PNG.sync.read(fs.readFileSync(pngFile));
        expect(png.width).toBe(640);
        expect(png.height).toBe(400);
    });

    test('wrong-size PNG is caught', () => {
        const pngFile = path.join(tmp, 'test-wrong.png');
        fs.writeFileSync(pngFile, makePNG(320, 200));
        const png = PNG.sync.read(fs.readFileSync(pngFile));
        expect(png.width).not.toBe(640);
    });

    test('validateFiles rejects null without throwing', () => {
        let result: any;
        expect(() => {
            result = validateFiles(null);
        }).not.toThrow();
        expect(result.ok).toBe(false);
    });

    test('validateFiles propagates data failures into ok=false', () => {
        const result = validateFiles({ schemaVersion: 'invalid' });
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.ok).toBe(false);
    });
});
