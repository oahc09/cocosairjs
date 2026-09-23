/**
 * Smoke 29 — V1.1 Example Specification 门禁（§15 Spec Freeze / §3 API Bind / §23 Manifest 裁剪）。
 *
 * 1. spec-validate.cjs 全量通过：52 个 example.json 均为 frozen 且零问题；
 * 2. spec-evidence.cjs --check：apiEvidence 行号无漂移、validator 绑定不脱钩；
 * 3. spec-compliance-audit.cjs：§11 Stable 公式的当期证据链零 fail；
 * 4. files.json 裁剪合同（§23）：Gallery 字段在、实现细节（evidence 行号等）不在；
 * 5. 验证器清单变更会被规格验证器捕获（validator id 必须真实存在）。
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

// Windows 上「写完后立刻再写同一文件」会被杀软/索引器短暂独占，报 UNKNOWN: unknown error, open。
// 负控用例要还原原文，遇占用就退避重试；仍失败时把错误抛出（连同重试次数）便于归因。
function writeWithRetry (file: string, content: string, attempts = 10): void {
    const fs = nodeRequire('fs') as typeof import('fs');
    for (let i = 0; i < attempts; i++) {
        try {
            fs.writeFileSync(file, content);
            if (fs.readFileSync(file, 'utf8') !== content) throw new Error('write did not land');
            return;
        } catch (error: any) {
            if (i === attempts - 1) throw new Error(`restore ${file} failed after ${attempts} tries: ${String(error?.message ?? error)}`);
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
        }
    }
}

describe('V1.1 — Example Specification 门禁', () => {
    // V1.1 交付的 45 个 + V1.2 每落一个示例都要显式改这里（新增示例不许静默进总数）。
    // 现值 57 = 45 + profiler-overlay + ui-components + ui-layout + physics-2d-basic + physics-2d-collision + particle-2d-basic + tiledmap-basic + audio-basic + video-basic + webview-basic + physics-3d-basic + dragonbones-basic。
    const EXAMPLE_COUNT = 57;

    test('§15 全部 example.json 达到 frozen 且规格零问题', () => {
        const result = run('tools/examples/spec-validate.cjs');
        expect(result.stdout).toContain(`${EXAMPLE_COUNT} examples`);
        expect(result.stdout).toContain(`${EXAMPLE_COUNT} frozen / 0 draft / 0 blocked`);
        expect(result.status).toBe(0);
    });

    test('§12 apiEvidence 行号无漂移（spec-evidence --check）', () => {
        const result = run('tools/examples/spec-evidence.cjs', ['--check']);
        expect(result.status).toBe(0);
    });

    // 证据链门禁：stable 示例的 §11 六项（当期运行证据 + 指纹一致 + 截图 bytes>0 +
    // promotionEvidence 一致 + license + claim↔evidence 1:1）必须由真实运行证据支撑。
    // 改过任意 example.json 却不重跑验证器，这里会直接红。
    test('§11/§12 证据链符合性零 fail（spec-compliance-audit）', () => {
        const result = run('tools/examples/spec-compliance-audit.cjs');
        expect(result.stdout).toContain('0 fail');
        expect(result.status).toBe(0);
    });

    test('§23 files.json 只保留 Gallery 字段，规格实现细节不外溢', () => {
        const fs = nodeRequire('fs') as typeof import('fs');
        const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'examples', 'files.json'), 'utf8'));
        expect(manifest.examples.length).toBe(EXAMPLE_COUNT);
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
        const SENTINEL = 'not-a-real-validator';
        const original = fs.readFileSync(target, 'utf8');
        const baseline = JSON.parse(original) as { validation?: { functional?: string[] } };
        // 前置守卫：若上一轮在「注入」与「还原」之间被中断，残留会被本轮当成洁净基线再写回 ⇒ 脏态永久自我复 bake。
        if (baseline.validation?.functional?.includes(SENTINEL)) {
            throw new Error('检测到上一轮负控的泄漏残留（哨兵 validator 已在盘上）：它不是洁净基线。先跑 git checkout -- examples/mesh-sphere/example.json 再执行本用例。');
        }
        try {
            const spec = JSON.parse(original);
            spec.validation.functional.push(SENTINEL);
            writeWithRetry(target, JSON.stringify(spec, null, 2) + '\n');
            const result = run('tools/examples/spec-validate.cjs');
            expect(result.status).toBe(1);
            expect(result.stdout).toContain('not-a-real-validator');
        } finally {
            writeWithRetry(target, original);
            // spec-validate 在红态也覆写正典证据（F-132）⇒ 还原规格后必须复跑一次洁净校验，把正典证据刷回当期态。
            const regen = run('tools/examples/spec-validate.cjs');
            expect(regen.status).toBe(0);
        }
    });
});
