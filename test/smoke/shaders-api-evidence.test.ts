const fs = require('node:fs');
const path = require('node:path');
const { validateAPIEvidence } = require('../../tools/verify/shaders-api-evidence.cjs');
describe('shader example executable API locations', () => {
    for (const id of ['shader-cursor-trail', 'shader-glass']) {
        const dir = path.resolve(__dirname, '../../examples', id);
        const spec = () => JSON.parse(fs.readFileSync(path.join(dir, 'example.json'), 'utf8'));
        test(`${id}: production source locator agrees with every entry`, () => {
            expect(validateAPIEvidence(dir, spec())).toEqual({ ok: true, errors: [] });
        });
        test.each(['L[object Object]', 'L0', 'L999999', undefined])(`${id}: reject invalid location %s`, (loc) => {
            const value = spec();
            value.api.evidence[0].sourceLocation = loc;
            expect(validateAPIEvidence(dir, value).ok).toBe(false);
        });
        test(`${id}: reject undeclared validator`, () => {
            const value = spec();
            value.api.evidence[0].validator = 'invented';
            expect(validateAPIEvidence(dir, value).ok).toBe(false);
        });
    }
    test.each([null, {}, [], 'invalid'])('malformed metadata is structured rejection %#', (value) => {
        expect(validateAPIEvidence('/missing-example', value).ok).toBe(false);
    });
});
