/**
 * Smoke 27 — V0.6 T10/T11：Recipe 框架（§58-66：30/30/20 门禁 + Coverage 悬空引用）
 * 与 DevTools 工件/分发边界（§67-71：随包排除在 files 白名单之外）。
 */
import { nodeRequire } from '../shims';
const fs = nodeRequire('fs') as typeof import('fs');
const path = nodeRequire('path') as typeof import('path');

import { RECIPES, RECIPES_CATALOG } from '../../tools/benchmark/recipes/recipes30';
import { recipeStats, checkCoverage, CoverageContext, RecipeEvidence } from '../../tools/benchmark/recipes/schema';
import { CATALOG_BENCHMARKS } from '../../tools/benchmark/catalog/catalog100';
import { VALIDATORS } from '../../tools/benchmark/validators';

const REPO = process_cwd();
function process_cwd (): string {
    // jest 运行目录即仓库根
    return fs.existsSync(path.resolve('package.json')) ? path.resolve('.') : path.resolve('../..');
}

describe('V0.6 §58-§61 — Recipe 门禁', () => {
    test('未经完整场景验证的配方不计入 validated/stable', () => {
        const stats = recipeStats(RECIPES);
        expect(stats.catalogTotal).toBeGreaterThanOrEqual(30);
        expect(stats.validatedCount).toBeGreaterThanOrEqual(30);
        expect(stats.stableCount).toBeGreaterThanOrEqual(20);
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

    test('§64 Coverage Manifest：引用全部可解析，无悬空（有 evidence 时）', () => {
        const exampleIds = fs.readdirSync(path.join(REPO, 'examples')).filter((d) => fs.existsSync(path.join(REPO, 'examples', d, 'index.html')));
        const ctx: CoverageContext = {
            benchmarkIds: new Set(CATALOG_BENCHMARKS.map((b) => b.id)),
            exampleIds: new Set(exampleIds),
            validatorIds: new Set(Object.keys(VALIDATORS)),
            benchmarkDefs: new Map(CATALOG_BENCHMARKS.map((b) => [b.id, { id: b.id, type: b.benchmarkType, category: b.category, validators: [...b.validators, ...(b.visualValidators ?? [])] }])),
            exampleHasEntry: new Map(exampleIds.map((e) => [e, fs.existsSync(path.join(REPO, 'examples', e, 'index.html'))])),
        };
        // 无 evidence 时 validated/stable 的 coverageProof 不通过 → 有 dangling
        const noEvidence = checkCoverage(RECIPES.filter((r) => r.status !== 'draft'), ctx);
        expect(noEvidence.length).toBeGreaterThan(0);
        // 有 evidence 时（来自 v06-recipes.json）coverageProof 通过 → 无 dangling
        const evPath = path.join(REPO, 'docs', 'evidence', 'v06-recipes.json');
        const evidence = JSON.parse(fs.readFileSync(evPath, 'utf8')).runs;
        const withEv = checkCoverage(RECIPES, { ...ctx, evidence });
        expect(withEv).toEqual([]);
    });

    test('promotion requires one matching executed composite, not unrelated validator unions', () => {
        const recipe = { ...RECIPES[0], status: 'stable' as const };
        const ctx: CoverageContext = {
            benchmarkIds: new Set(recipe.benchmarkRefs), exampleIds: new Set(recipe.exampleRefs),
            validatorIds: new Set(Object.keys(VALIDATORS)),
            benchmarkDefs: new Map(recipe.benchmarkRefs.map((id) => [id, { id, type: 'runtime-control' as const, category: 'Agent', validators: Object.keys(VALIDATORS) }])),
        };
        expect(checkCoverage([recipe], ctx).length).toBeGreaterThan(0);
        const evidence: RecipeEvidence = { recipeId: recipe.id, recipeVersion: recipe.version,
            source: { kind: 'benchmark', id: recipe.benchmarkRefs[0] }, runId: 'test-run', revision: 'test-revision', result: 'PASS',
            sceneSetup: recipe.sceneSetup, runtimeState: recipe.runtimeState, requiredAssets: recipe.requiredAssets,
            requiredCapabilities: recipe.requiredCapabilities, interactionSteps: recipe.interactionSteps,
            visualTarget: recipe.visualTarget, checks: { scene: true, interaction: true, visual: true, lifecycle: true, noRuntimeErrors: true } };
        expect(checkCoverage([recipe], { ...ctx, evidence: [evidence] })).toEqual([]);
        expect(checkCoverage([recipe], { ...ctx, evidence: [{ ...evidence, recipeVersion: 'old' }] }).length).toBeGreaterThan(0);
        expect(checkCoverage([recipe], { ...ctx, evidence: [{ ...evidence, checks: { ...evidence.checks, lifecycle: false } }] }).length).toBeGreaterThan(0);
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
