/**
 * Smoke 27 — V0.6 T10/T11：Recipe 框架（§58-66：30/30/20 门禁 + Coverage 悬空引用）
 * 与 DevTools 工件/分发边界（§67-71：随包排除在 files 白名单之外）。
 */
import { nodeRequire } from '../shims';
const fs = nodeRequire('fs') as typeof import('fs');
const path = nodeRequire('path') as typeof import('path');

import { RECIPES, RECIPES_CATALOG } from '../../tools/benchmark/recipes/recipes30';
import { recipeStats, checkCoverage, CoverageContext } from '../../tools/benchmark/recipes/schema';
import { CATALOG_BENCHMARKS } from '../../tools/benchmark/catalog/catalog100';
import { VALIDATORS } from '../../tools/benchmark/validators';

const REPO = process_cwd();
function process_cwd (): string {
    // jest 运行目录即仓库根
    return fs.existsSync(path.resolve('package.json')) ? path.resolve('.') : path.resolve('../..');
}

describe('V0.6 §58-§61 — Recipe 门禁', () => {
    test('Catalog Total >= 30 且 Validated Count >= 30 且 Stable Count >= 20（§60）', () => {
        const stats = recipeStats(RECIPES);
        expect(stats.catalogTotal).toBeGreaterThanOrEqual(30);
        expect(stats.validatedCount).toBeGreaterThanOrEqual(30);
        expect(stats.stableCount).toBeGreaterThanOrEqual(20);
        // 状态机合法：stable ⊂ validated（由 recipeStats 语义保证）；无 draft 混入首批
        for (const r of RECIPES) {
            expect(['validated', 'stable']).toContain(r.status);
        }
    });

    test('§65 首批命名与分组（Character/Product/Camera/Interaction/Material/Experience 各 5）', () => {
        const groups: Record<string, number> = {};
        for (const r of RECIPES) {
            const idx = Number(r.id.slice(1));
            const group = Math.floor((idx - 1) / 5);
            groups[group] = (groups[group] || 0) + 1;
        }
        for (let g = 0; g < 6; g++) {
            expect(groups[g]).toBe(5);
        }
        // R001..R030 连续无缺
        for (let i = 1; i <= 30; i++) {
            expect(RECIPES.some((r) => r.id === 'R' + String(i).padStart(3, '0'))).toBe(true);
        }
    });

    test('§64 Coverage Manifest：引用全部可解析，无悬空', () => {
        const exampleIds = fs.readdirSync(path.join(REPO, 'examples')).filter((d) => fs.existsSync(path.join(REPO, 'examples', d, 'index.html')));
        const ctx: CoverageContext = {
            benchmarkIds: new Set(CATALOG_BENCHMARKS.map((b) => b.id)),
            exampleIds: new Set(exampleIds),
            validatorIds: new Set(Object.keys(VALIDATORS)),
            benchmarkDefs: new Map(CATALOG_BENCHMARKS.map((b) => [b.id, { id: b.id, type: b.benchmarkType, category: b.category, validators: [...b.validators, ...(b.visualValidators ?? [])] }])),
            exampleHasEntry: new Map(exampleIds.map((e) => [e, fs.existsSync(path.join(REPO, 'examples', e, 'index.html'))])),
        };
        const dangling = checkCoverage(RECIPES, ctx);
        expect(dangling).toEqual([]);
    });

    test('stable Recipe 必有完整 example 或 composite benchmark 挂接（§63）', () => {
        for (const r of RECIPES.filter((x) => x.status === 'stable')) {
            expect(r.benchmarkRefs.length + r.exampleRefs.length).toBeGreaterThan(0);
            expect(r.interactionSteps.length).toBeGreaterThan(0);
        }
    });
});

describe('V0.6 §67-71 — 分发边界', () => {
    test('npm files 白名单不含 tools/debug、devtools、benchmark、fixtures', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
        const files: string[] = pkg.files ?? [];
        for (const banned of ['tools', 'tools/', 'devtools', 'benchmark', 'fixtures', 'test', 'src']) {
            expect(files.some((f) => f === banned || f.startsWith(banned + '/'))).toBe(false);
        }
    });

    test('build/devtools 工件脚本存在（由 v06-fresh-consumer 产出）', () => {
        const devtools = path.join(REPO, 'build', 'devtools');
        // 工件由 Fresh Consumer Gate 生成；此处验证脚本在场
        expect(fs.existsSync(path.join(REPO, 'tools', 'verify', 'v06-fresh-consumer.cjs'))).toBe(true);
        void devtools;
    });
});
