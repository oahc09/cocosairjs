import { nodeRequire } from '../shims';
const { execFileSync } = nodeRequire('child_process');
test('real benchmark toolchain rejects invalid types, survives cleanup hangs and parses recipes', () => {
    const result = execFileSync(process.execPath, ['tools/verify/benchmark-regression.cjs'], { encoding: 'utf8', timeout: 25000 });
    expect(JSON.parse(result)).toMatchObject({ ok: true, checks: 8 });
});
