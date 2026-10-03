import { nodeRequire, nodeProcess } from '../shims';
const { validatePhysicalEvidence } = nodeRequire(nodeRequire('path').join(nodeProcess.cwd(), 'tools/verify/capability-evidence.cjs'));
const expected = { bundleSha256: 'bundle', sourceSha256: 'probe', runnerSha256: 'runner', fixtureSha256: 'model' };
function report(): any {
    return { ok: true, ...expected, fixture: { sha256: 'model' }, records: ['chromium', 'firefox', 'webkit'].map((engine) => ({
        engine, ok: true, failures: [], result: { glError: 0, sceneColorBound: true, transmissionEnabled: true,
            uniforms: [0, 1], changedPixels: 50, absoluteDifference: 1000,
            volumeDifference: { changedPixels: 50 }, dispersionDifference: { changedPixels: 20 } },
    })) };
}
describe('physical capability evidence has current rendered controls', () => {
    test('current complete three-browser report passes', () => expect(validatePhysicalEvidence(report(), expected).ok).toBe(true));
    test('a stale bundle or probe cannot retain browser-evidence', () => {
        for (const field of ['bundleSha256', 'sourceSha256', 'runnerSha256']) {
            const r = report(); r[field] = 'old'; expect(validatePhysicalEvidence(r, expected).ok).toBe(false);
        }
    });
    test('missing/duplicate browsers and a claimed success without pixel change fail', () => {
        const incomplete = report(); incomplete.records.pop(); expect(validatePhysicalEvidence(incomplete, expected).ok).toBe(false);
        const duplicated = report(); duplicated.records[2].engine = 'firefox'; expect(validatePhysicalEvidence(duplicated, expected).ok).toBe(false);
        const silent = report(); silent.records[0].result.dispersionDifference.changedPixels = 0; expect(validatePhysicalEvidence(silent, expected).ok).toBe(false);
    });
    test('GL errors, missing captures and non-finite measurements fail', () => {
        for (const field of ['glError', 'sceneColorBound', 'changedPixels']) {
            const r = report(); r.records[0].result[field] = field === 'sceneColorBound' ? false : field === 'glError' ? 1282 : NaN;
            expect(validatePhysicalEvidence(r, expected).ok).toBe(false);
        }
    });
});
