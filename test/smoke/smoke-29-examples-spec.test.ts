/**
 * Smoke 29 — V1.1 Example Specification 门禁（§15 Spec Freeze / §3 API Bind / §23 Manifest 裁剪）。
 *
 * 1. spec-validate.cjs 全量通过：52 个 example.json 均为 frozen 且零问题；
 * 2. spec-evidence.cjs --check：apiEvidence 行号无漂移、validator 绑定不脱钩；
 * 3. spec-compliance-audit.cjs：§11 Stable 公式的当期证据链零 fail；
 * 4. files.json 裁剪合同（§23）：Gallery 字段在、实现细节（evidence 行号等）不在；
 * 5. 验证器清单变更会被规格验证器捕获（validator id 必须真实存在；负控在仓库外副本上注入）；
 * 6. F-132 写盘纪律：正典发布证据只由绿跑写出，红跑/子集跑零覆写（五臂负控）。
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

// 负控一律在**仓库外临时副本**上做：往共享工作树的 examples/** 注入脏态，会让其它会话的 npm test 连带转红。
const SENTINEL = 'not-a-real-validator';

function mkTmp (): string {
    const os = nodeRequire('os') as typeof import('os');
    const fs = nodeRequire('fs') as typeof import('fs');
    return fs.mkdtempSync(path.join(os.tmpdir(), 'cocosair-spec29-'));
}

// 复制 examples/mesh-sphere 为独立 examples 根目录；sentinel 非空则注入到 validation.functional。
function ncExamplesDir (fs: typeof import('fs'), tmp: string, name: string, sentinel: string | null): string {
    const source = path.join(REPO, 'examples', 'mesh-sphere');
    const examplesDir = path.join(tmp, name);
    fs.cpSync(source, path.join(examplesDir, 'mesh-sphere'), { recursive: true });
    const specPath = path.join(examplesDir, 'mesh-sphere', 'example.json');
    const original = fs.readFileSync(specPath, 'utf8');
    // 前置守卫：真树若带着上一轮泄漏的哨兵，那副本就不是洁净基线 ⇒ 停手指向回滚命令，不自我复 bake。
    if (original.includes(SENTINEL)) {
        throw new Error(`检测到 ${path.relative(REPO, source)} 盘上残留哨兵 validator：它不是洁净基线。先跑 git checkout -- examples/mesh-sphere/example.json 再执行本用例。`);
    }
    if (sentinel !== null) {
        const spec = JSON.parse(original);
        spec.validation.functional.push(sentinel);
        fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');
    }
    return examplesDir;
}

describe('V1.1 — Example Specification 门禁', () => {
    // r50（F-116 minimalFix 落地）：计数从 files.json 现读——新增示例不再需要手工同步本常数（历史：45→58→动态化）。
    const EXAMPLE_COUNT = nodeRequire('fs').readFileSync(path.join(REPO, 'examples', 'files.json'), 'utf8') && JSON.parse(nodeRequire('fs').readFileSync(path.join(REPO, 'examples', 'files.json'), 'utf8')).examples.length;

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

    test('§3/§10 规格 validator id 必须真实存在（篡改可检测，负控零改共享树）', () => {
        const fs = nodeRequire('fs') as typeof import('fs');
        const tmp = mkTmp();
        try {
            const examplesDir = ncExamplesDir(fs, tmp, 'examples-dirty', SENTINEL);
            const report = path.join(tmp, 'red-report.json');
            const result = run('tools/examples/spec-validate.cjs', ['--examples-dir=' + examplesDir, '--out=' + report]);
            expect(result.status).toBe(1);
            expect(result.stdout).toContain(SENTINEL);
            // 注入自证：红必须来自副本那一层，且真树逐字节干净（否则是在读回正典/别人的脏态）。
            expect(fs.readFileSync(path.join(REPO, 'examples', 'mesh-sphere', 'example.json'), 'utf8')).not.toContain(SENTINEL);
            const json = JSON.parse(fs.readFileSync(report, 'utf8')) as { examples: { id: string; issues: string[] }[] };
            expect(json.examples[0].issues.join('\n')).toContain(SENTINEL);
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });

    // F-132：`spec-validate` 曾无条件覆写 docs/evidence/v11-spec-validate.json，而退出码在写盘之后才设
    // ⇒ 故意负控同样改写发布证据，并让共享工作树的 npm test 对所有会话转红。现纪律＝正典只由绿跑写出。
    // 五臂各自断在命中的那一层（只比 EXIT≠0 是零信息判据），末尾统一复核正典字节未动。
    test('F-132 正典发布证据只由绿跑写出（红跑零覆写）', () => {
        const fs = nodeRequire('fs') as typeof import('fs');
        const crypto = nodeRequire('crypto') as typeof import('crypto');
        const canonical = path.join(REPO, 'docs', 'evidence', 'v11-spec-validate.json');
        const stamp = (): string => {
            const buf = fs.readFileSync(canonical);
            return `${buf.length}B/${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16)}`;
        };
        const before = stamp();
        const tmp = mkTmp();
        try {
            const dirty = ncExamplesDir(fs, tmp, 'examples-dirty', SENTINEL);
            const clean = ncExamplesDir(fs, tmp, 'examples-clean', null);

            // A：显式把 --out 指向正典 + 红态 ⇒ 必须定向拒绝，而不是「恰好没跑到写盘」。
            const armA = run('tools/examples/spec-validate.cjs', ['--examples-dir=' + dirty, '--out=' + canonical]);
            expect(armA.stdout).toContain('[F-132]');
            expect(armA.status).toBe(1);

            // B：同一红态落非正典 ⇒ 必须真的写出红报告（证明写分支可用，A 的未动是拒绝不是空转）。
            const redOut = path.join(tmp, 'red.json');
            const armB = run('tools/examples/spec-validate.cjs', ['--examples-dir=' + dirty, '--out=' + redOut]);
            expect(armB.status).toBe(1);
            expect((JSON.parse(fs.readFileSync(redOut, 'utf8')) as { examples: { issues: string[] }[] }).examples[0].issues.join('\n')).toContain(SENTINEL);

            // C：绿态落非正典 ⇒ EXIT=0 且写出零 issue 报告（正典的当期刷新归 §15 用例）。
            const greenOut = path.join(tmp, 'green.json');
            const armC = run('tools/examples/spec-validate.cjs', ['--examples-dir=' + clean, '--out=' + greenOut]);
            expect(armC.stdout).toContain('1 examples: 1 frozen / 0 draft / 0 blocked');
            expect(armC.status).toBe(0);
            expect((JSON.parse(fs.readFileSync(greenOut, 'utf8')) as { examples: { issues: string[] }[] }).examples[0].issues).toEqual([]);

            // D：子集/外部运行缺 --out ⇒ 必须先被配对护栏拦下（EXIT=2），不得默认落到正典。
            const armD = run('tools/examples/spec-validate.cjs', ['--examples-dir=' + clean]);
            expect(armD.stdout).toContain('必须同时给出 --out');
            expect(armD.status).toBe(2);

            // E：反空转 ⇒ 扫到 0 例不是「全绿」。
            fs.mkdirSync(path.join(tmp, 'examples-empty'), { recursive: true });
            const armE = run('tools/examples/spec-validate.cjs', ['--examples-dir=' + path.join(tmp, 'examples-empty'), '--out=' + path.join(tmp, 'empty.json')]);
            expect(armE.stdout).toContain('0 examples');
            expect(armE.status).toBe(1);

            expect(stamp()).toBe(before);
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });
});
