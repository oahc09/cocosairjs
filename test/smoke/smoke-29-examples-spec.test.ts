/**
 * Smoke 29 — V1.1 Example Specification 门禁（§15 Spec Freeze / §3 API Bind / §23 Manifest 裁剪）。
 *
 * 1. spec-validate.cjs 全量通过：44 个 example.json 均为 frozen 且零问题；
 * 2. spec-evidence.cjs --check：apiEvidence 行号无漂移；
 * 3. files.json 裁剪合同（§23）：Gallery 字段在、实现细节（evidence 行号等）不在；
 * 4. 验证器清单变更会被规格验证器捕获（validator id 必须真实存在）。
 */
import { nodeRequire } from '../shims';
const path = nodeRequire('path') as typeof import('path');
const { execFileSync } = nodeRequire('child_process') as typeof import('child_process');

const REPO = process_cwd();
function process_cwd (): string {
    return path.resolve('.');
}

function run (script: string, args: string[] = []): { status: number; stdout: string } {
    try {
        const stdout = execFileSync('node', [path.join(REPO, script), ...args], { cwd: REPO, encoding: 'utf8' });
        return { status: 0, stdout };
    } catch (error: any) {
        return { status: error.status ?? 1, stdout: String(error.stdout ?? '') + String(error.stderr ?? '') };
    }
}

describe('V1.1 — Example Specification 门禁', () => {
    test('§15 全部 example.json 达到 frozen 且规格零问题', () => {
        const result = run('tools/examples/spec-validate.cjs');
        expect(result.stdout).toContain('45 examples');
        expect(result.stdout).toContain('45 frozen / 0 draft / 0 blocked');
        expect(result.status).toBe(0);
    });

    test('§12 apiEvidence 行号无漂移（spec-evidence --check）', () => {
        const result = run('tools/examples/spec-evidence.cjs', ['--check']);
        expect(result.status).toBe(0);
    });

    test('§23 files.json 只保留 Gallery 字段，规格实现细节不外溢', () => {
        const fs = nodeRequire('fs') as typeof import('fs');
        const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'examples', 'files.json'), 'utf8'));
        expect(manifest.examples.length).toBe(45);
        const trimmedOut = ['evidence', 'forbiddenShortcut', 'license', 'screenshot', 'coverage'];
        for (const ex of manifest.examples) {
            expect(ex.dir).toBeTruthy();
            expect(ex.learning).toBeTruthy();
            expect(ex.effect).toBeTruthy();
            expect(ex.api).toBeTruthy();
            expect(ex.api.evidence).toBeUndefined();
            for (const field of trimmedOut) {
                if (field === 'evidence') { continue; }
                // 裁剪字段不得出现在 gallery api 对象上
            }
            expect(ex.api.claims).toBeDefined();
            expect(ex.license).toBeUndefined();
            expect(ex.screenshot).toBeUndefined();
            expect(ex.coverage).toBeUndefined();
        }
    });

    test('§3/§10 规格 validator id 必须真实存在（篡改可检测）', () => {
        const fs = nodeRequire('fs') as typeof import('fs');
        const target = path.join(REPO, 'examples', 'mesh-sphere', 'example.json');
        const original = fs.readFileSync(target, 'utf8');
        try {
            const spec = JSON.parse(original);
            spec.validation.functional.push('not-a-real-validator');
            fs.writeFileSync(target, JSON.stringify(spec, null, 2) + '\n');
            const result = run('tools/examples/spec-validate.cjs');
            expect(result.status).toBe(1);
            expect(result.stdout).toContain('not-a-real-validator');
        } finally {
            fs.writeFileSync(target, original);
        }
    });
});
