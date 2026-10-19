import { nodeRequire } from '../shims';

// Imported collector helpers are not executed by this read-only map check.
jest.mock('esbuild', () => ({}));
jest.mock('../../tools/verify/browser-engines.cjs', () => ({
    launchOptions: () => ({ executablePath: '/CPU-NO-BROWSER', args: [] }),
}));

// Requires the single fresh runtime/Spark build. CPU fixture negatives run before it.
const path = nodeRequire('path') as typeof import('path');
const root = path.resolve('.');
const preflight = nodeRequire(path.join(root, 'tools/verify/example-evidence-preflight.cjs'));

test('current generated source maps match real current inputs', () => {
    const maps = preflight.checkSourceMaps(root);
    expect(maps).toHaveLength(3);
    expect(maps.every((map: any) => map.verifiedSources > 0)).toBe(true);
    expect(maps[2].virtual.map((item: any) => item.source)).toEqual(['air-inline-worker:air-spark-inline-worker']);
});
