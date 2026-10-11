// Lead contract regressions. Synthetic Node evidence only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { glassEffectDefinition } from '../../examples/shader-glass-trail/src/effect.generated';
const C = require('../../tools/verify/shaders-glass-trail-oracle.cjs');
const G = require('../../tools/verify/shaders-glass-oracle.cjs');
const B = require('../../tools/verify/shaders-glass-trail-browser.cjs');
const { PNG } = require('pngjs');
function resources() {
    return {
        rows: Array.from({ length: 100 }, (_, index) => ({
            index,
            id: index + 1,
            before: { bufferSize: 100, textureSize: 100 },
            created: { bufferSize: 200, textureSize: 200 },
            after: { bufferSize: 100, textureSize: 100 },
            trace: {
                refs: C.OWNED_KINDS.map((kind: string) => ({ kind, before: 1, after: 0 })),
                renderersUnbound: true,
                nodesRemoved: true,
                trailDetached: true,
                trailDisposed: true,
            },
            repeat: { idempotent: true },
            nodeValid: false,
            registryPresent: false,
        })),
    };
}
describe('C03 Lead production contract review', () => {
    test('resource baseline is accepted before mutation checks', () => {
        expect(C.resourceAudit(resources()).errors).toEqual([]);
    });
    test('non-finite texture allocation cannot pass', () => {
        const raw = resources();
        raw.rows.forEach((r: any) => {
            r.before.textureSize = Infinity;
            r.after.textureSize = Infinity;
            r.created.textureSize = Infinity;
        });
        expect(C.resourceAudit(raw).errors.length).toBeGreaterThan(0);
    });
    test('100 cycles with no actual buffer or texture allocation cannot pass', () => {
        const raw = resources();
        raw.rows.forEach((r: any) => {
            r.created = { ...r.before };
        });
        expect(C.resourceAudit(raw).errors.length).toBeGreaterThan(0);
    });
    test('PNG audit rejects presentation accidentally passed as trajectory without throwing', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c03-review-'));
        try {
            const file = path.join(dir, 'valid.png');
            const png = new PNG({ width: 8, height: 8 });
            png.data.fill(255);
            fs.writeFileSync(file, PNG.sync.write(png));
            let result: any;
            expect(() => {
                result = C.pngAudit(file, C.defaults(), 0.25, { background: [8, 9, 12] });
            }).not.toThrow();
            expect(result.errors.length).toBeGreaterThan(0);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
    test('native fixed Fresnel softness equals the CPU mother default', () => {
        const main = fs.readFileSync(path.resolve(__dirname, '../../examples/shader-glass-trail/src/main.ts'), 'utf8');
        const literal = main.match(/setProperty\('(?:gs|glass)3',\s*new Vec4\(([\d.]+),/);
        if (literal) expect(Number(literal[1])).toBe(G.defaults().fresnelSoftness);
        else {
            // A shared mapped value must appear in the real uniform upload instead of a literal.
            expect(main).toMatch(/setProperty\('(?:gs|glass)3',[\s\S]*?fresnelSoftness/);
        }
    });
    test('generated metadata matches all GLSL Constants members in order', () => {
        const shader = glassEffectDefinition.shaders[0];
        const body = shader.glsl3.frag.match(/uniform Constants\s*\{([\s\S]*?)\}/)?.[1];
        expect(body).toBeDefined();
        const declared = [...body!.matchAll(/vec4\s+(\w+)\s*;/g)].map((m) => m[1]);
        const members = shader.blocks.find((b) => b.name === 'Constants')!.members.map((m) => m.name);
        expect(members).toEqual(declared);
        expect(Object.keys(glassEffectDefinition.techniques[0].passes[0].properties)).toEqual(
            expect.arrayContaining(declared),
        );
    });
    test('collector closure binds actual Glass and Trail mothers', () => {
        expect(B.INPUTS).toEqual(
            expect.arrayContaining([
                'tools/verify/shaders-cursor-trail-oracle.cjs',
                'tools/verify/shaders-glass-oracle.cjs',
                'examples/shader-cursor-trail/parameters.json',
                'examples/shader-glass/parameters.json',
            ]),
        );
        expect(B.REFERENCE.files).toEqual(
            expect.arrayContaining([
                'packages/core/src/shaders/CursorTrail/index.ts',
                'packages/core/src/shaders/Glass/index.ts',
            ]),
        );
    });
});
