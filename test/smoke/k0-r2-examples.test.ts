import { readFileSync } from 'fs';
import { resolve } from 'path';

const { checkRow } = require('../../tools/verify/k0-r2-examples.cjs');
const report = JSON.parse(readFileSync(resolve(__dirname, '../../docs/evidence/examples/k0-r2/examples-verified.json'), 'utf8'));
const clone = () => JSON.parse(JSON.stringify(report.rows[0]));

describe('K0 R2 runnable examples acceptance', () => {
    test.each(['chromium', 'firefox', 'webkit'])('%s has measured controls, pixels, loop and cleanup', engine => {
        const row = report.rows.find((r: { engine: string }) => r.engine === engine);
        expect(row).toBeDefined();
        expect(checkRow(row)).toEqual({ pass: true, errors: [] });
    });
    test('incomplete observation is rejected', () => {
        const row = clone(); delete row.skin;
        expect(checkRow(row).pass).toBe(false);
    });
    test('unchanged dynamic geometry cannot pass', () => {
        const row = clone(); row.dynamic.changedPixels = 0;
        expect(checkRow(row).errors).toContain('dynamic movement');
    });
    test('a retained mesh reference cannot pass cleanup', () => {
        const row = clone(); row.release.releasedAssets[0].afterRefCount = 1;
        expect(checkRow(row).errors).toContain('release references');
    });
    test('looping by modifying a shared clip cannot pass', () => {
        const row = clone(); row.skin.clipUnchanged = false;
        expect(checkRow(row).errors).toContain('native skin loop');
    });
    test('a white frame cannot pass vertex colors', () => {
        const row = clone(); row.vertex.counts = { red: 0, green: 0, blue: 0, foreground: 90000 };
        expect(checkRow(row).errors).toContain('vertex colors');
    });
    test('a browser exception cannot pass', () => {
        const row = clone(); row.pageErrors.push('render failed');
        expect(checkRow(row).errors).toContain('browser errors');
    });
});
