/** Synthetic pixel-contract checks; actual browser evidence is collected separately. */
const { oracleFor, checkCase, validateBrowserReport } = require('../../tools/verify/interactive-improvement-browser.cjs');
const { evaluateVisibility } = require('../../tools/verify/interactive-improvement-evidence.cjs');

describe('IER independent analytic projection and pixel rejection', () => {
    test('orthographic target projection scales with screenshot DPR', () => {
        const viewport = { width: 512, height: 384 };
        expect(oracleFor(viewport, 1, -1).expectedCentroid).toEqual([159.5,191.5]);
        expect(oracleFor(viewport, 2, 1).expectedCentroid).toEqual([703.5,383.5]);
    });
    const png = { width:8, height:8, data:Buffer.alloc(8*8*4) };
    for (let y=2;y<6;y++)for(let x=2;x<6;x++) { png.data[(y*8+x)*4]=229; png.data[(y*8+x)*4+3]=255; }
    const oracle = { region:[0,0,8,8],kind:'red',minPixels:16,expectedCentroid:[3.5,3.5],tolerance:0 };
    test('actual pixel loop computes hit count and centroid', () => {
        expect(evaluateVisibility(png,oracle)).toMatchObject({ok:true,hits:16,centroid:[3.5,3.5]});
    });
    test('an occluded image cannot pass because the model changed', () => {
        expect(evaluateVisibility({...png,data:Buffer.alloc(8*8*4)},oracle).ok).toBe(false);
    });
    test('centroid rejects a visible object in the wrong position', () => {
        expect(evaluateVisibility(png,{...oracle,expectedCentroid:[0,0]}).ok).toBe(false);
    });
    test.each([NaN,Infinity])('non-finite expected centroid %s is rejected', value => {
        expect(evaluateVisibility(png,{...oracle,expectedCentroid:[value,3.5]}).ok).toBe(false);
    });
    test.each([-1,NaN])('invalid tolerance %s cannot bypass the oracle', value => {
        expect(evaluateVisibility(png,{...oracle,tolerance:value}).ok).toBe(false);
    });
    test('fractional pixel region is rejected rather than bitwise rounded', () => {
        expect(evaluateVisibility(png,{...oracle,region:[0.1,0,7,8]}).ok).toBe(false);
    });
    test('malformed reports/cases give a failure receipt', () => {
        expect(validateBrowserReport(null).ok).toBe(false);
        expect(checkCase(null,'moved','test').ok).toBe(false);
    });
});
