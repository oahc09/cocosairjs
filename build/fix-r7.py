# -*- coding: utf-8 -*-
"""R7: recipes/schema.ts — machine-readable status derivation."""
import io

p = 'tools/benchmark/recipes/schema.ts'
s = io.open(p, encoding='utf-8').read()

old = """export interface CoverageContext {
    benchmarkIds: Set<string>;
    exampleIds: Set<string>;
    validatorIds: Set<string>;
}

/** §64：悬空引用检查——返回悬空引用列表（空 = 通过）。 */
export function checkCoverage (recipes: RecipeDefinition[], ctx: CoverageContext): string[] {
    const dangling: string[] = [];
    for (const recipe of recipes) {
        for (const b of recipe.benchmarkRefs) {
            if (!ctx.benchmarkIds.has(b)) { dangling.push(`${recipe.id}: benchmarkRef ${b} 不存在`); }
        }
        for (const e of recipe.exampleRefs) {
            if (!ctx.exampleIds.has(e)) { dangling.push(`${recipe.id}: exampleRef ${e} 不存在`); }
        }
        for (const v of recipe.validatorRefs) {
            if (!ctx.validatorIds.has(v)) { dangling.push(`${recipe.id}: validatorRef ${v} 不存在`); }
        }
        // 稳定晋升硬条件（§63）：必须有完整 example 或 composite benchmark
        if (recipe.status === 'stable' && recipe.benchmarkRefs.length === 0 && recipe.exampleRefs.length === 0) {
            dangling.push(`${recipe.id}: stable requires a complete example or composite benchmark ref`);
        }
        // validated 起步必须六要素齐备（§62）
        if (recipe.status === 'validated' || recipe.status === 'stable') {
            for (const [field, value] of Object.entries({
                sceneSetup: recipe.sceneSetup,
                runtimeState: recipe.runtimeState,
                visualTarget: recipe.visualTarget,
            })) {
                if (!value) { dangling.push(`${recipe.id}: ${field} required for ${recipe.status}`); }
            }
            if (recipe.interactionSteps.length === 0 && recipe.status === 'stable') {
                dangling.push(`${recipe.id}: stable requires interaction steps`);
            }
        }
    }
    return dangling;
}"""

new = """export interface BenchmarkCoverageInfo {
    id: string;
    type: 'runtime-control' | 'source-create' | 'source-repair';
    category: string;
    validators: string[];
}

export interface CoverageContext {
    benchmarkIds: Set<string>;
    exampleIds: Set<string>;
    validatorIds: Set<string>;
    /** §63 机器可读覆盖校验：benchmark 定义的 id → 类型/类别/validators。 */
    benchmarkDefs?: Map<string, BenchmarkCoverageInfo>;
    /** example 目录是否存在可运行入口（index.html）。 */
    exampleHasEntry?: Map<string, boolean>;
}

/** Recipe 四要素覆盖证明（§63 完整场景/关键交互/关键视觉/资源生命周期）：
 *  由 benchmarkRefs 的 validators 并集 + validatorRefs + example 存在性机器推导。 */
function coverageProof (recipe: RecipeDefinition, ctx: CoverageContext): { scene: boolean; interaction: boolean; visual: boolean; lifecycle: boolean } {
    const validatorUnion = new Set<string>([...recipe.validatorRefs, ...recipe.visualRefs]);
    let hasInteractionBench = false;
    for (const ref of recipe.benchmarkRefs) {
        const def = ctx.benchmarkDefs?.get(ref);
        if (!def) { continue; }
        for (const v of def.validators) { validatorUnion.add(v); }
        if (def.type === 'runtime-control' || def.category === 'Interaction' || def.category === 'Agent') { hasInteractionBench = true; }
    }
    const exampleOk = recipe.exampleRefs.some((e) => ctx.exampleHasEntry?.get(e) === true);
    return {
        scene: validatorUnion.has('scene-ready') || exampleOk,
        interaction: recipe.interactionSteps.length > 0 && (hasInteractionBench || recipe.exampleRefs.length > 0),
        visual: validatorUnion.has('visible-frame') || recipe.visualRefs.includes('visible-frame') || recipe.exampleRefs.length > 0,
        lifecycle: validatorUnion.has('resource-released') || validatorUnion.has('no-runtime-error'),
    };
}

/** §64：悬空引用 + §62/§63 状态机器可读校验——返回违规列表（空 = 通过）。 */
export function checkCoverage (recipes: RecipeDefinition[], ctx: CoverageContext): string[] {
    const dangling: string[] = [];
    for (const recipe of recipes) {
        for (const b of recipe.benchmarkRefs) {
            if (!ctx.benchmarkIds.has(b)) { dangling.push(`${recipe.id}: benchmarkRef ${b} 不存在`); }
        }
        for (const e of recipe.exampleRefs) {
            if (!ctx.exampleIds.has(e)) { dangling.push(`${recipe.id}: exampleRef ${e} 不存在`); }
            else if (ctx.exampleHasEntry && ctx.exampleHasEntry.get(e) !== true) { dangling.push(`${recipe.id}: exampleRef ${e} 无可运行入口`); }
        }
        for (const v of recipe.validatorRefs) {
            if (!ctx.validatorIds.has(v)) { dangling.push(`${recipe.id}: validatorRef ${v} 不存在`); }
        }
        // validated 起步必须六要素齐备（§62）
        if (recipe.status === 'validated' || recipe.status === 'stable') {
            for (const [field, value] of Object.entries({
                sceneSetup: recipe.sceneSetup,
                runtimeState: recipe.runtimeState,
                visualTarget: recipe.visualTarget,
            })) {
                if (!value) { dangling.push(`${recipe.id}: ${field} required for ${recipe.status}`); }
            }
        }
        // §63：validated/stable 必须有四要素覆盖证明（机器推导，非手工声明）
        if (recipe.status === 'validated' || recipe.status === 'stable') {
            const proof = coverageProof(recipe, ctx);
            for (const [elem, ok] of Object.entries(proof)) {
                if (!ok) { dangling.push(`${recipe.id}: ${recipe.status} missing coverage proof for ${elem}`); }
            }
        }
    }
    return dangling;
}"""
assert old in s, 'checkCoverage'
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('schema ok')
