/**
 * V0.6 §58-§64 — Recipe Schema 与 Coverage Manifest 合同。
 *
 * 状态机：draft → validated → stable（deprecated 旁路）。
 * 统计语义（§59/§60）：Validated Count = validated + stable（stable ⊂ validated）；
 * Effective = validated ∪ stable；draft/deprecated 不计。
 */

export type RecipeStatus = 'draft' | 'validated' | 'stable' | 'deprecated';

export interface RecipeDefinition {
    id: string; // R001...
    version: string;
    name: string;
    status: RecipeStatus;
    description: string;

    /** §62：进入 validated 必须覆盖的六要素。 */
    sceneSetup: string;
    requiredAssets: string[];
    requiredCapabilities: string[];
    runtimeState: string;
    interactionSteps: string[];
    visualTarget: string;

    /** §64：Coverage Manifest（CI 检查悬空引用）。 */
    benchmarkRefs: string[];
    exampleRefs: string[];
    validatorRefs: string[];
    visualRefs: string[];

    tags: string[];
    deprecated?: boolean;
    supersededBy?: string;
}

export interface RecipeCoverageStats {
    catalogTotal: number;
    validatedCount: number; // validated + stable
    stableCount: number;
}

export function recipeStats (recipes: RecipeDefinition[]): RecipeCoverageStats {
    const live = recipes.filter((r) => r.status !== 'deprecated');
    const validated = live.filter((r) => r.status === 'validated' || r.status === 'stable');
    return {
        catalogTotal: live.length,
        validatedCount: validated.length,
        stableCount: live.filter((r) => r.status === 'stable').length,
    };
}

export interface BenchmarkCoverageInfo {
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
 *  仅由 benchmarkDefs 的实际 validators 并集机器推导——recipe 自声明的
 *  validatorRefs/visualRefs 不算证据（防自证循环）。example 仅当可运行入口存在。 */
function coverageProof (recipe: RecipeDefinition, ctx: CoverageContext): { scene: boolean; interaction: boolean; visual: boolean; lifecycle: boolean; detail: string } {
    const validatorUnion = new Set<string>();
    let hasInteractionBench = false;
    for (const ref of recipe.benchmarkRefs) {
        const def = ctx.benchmarkDefs?.get(ref);
        if (!def) { continue; }
        for (const v of def.validators) { validatorUnion.add(v); }
        if (def.type === 'runtime-control' || def.category === 'Interaction' || def.category === 'Agent') { hasInteractionBench = true; }
    }
    const exampleOk = recipe.exampleRefs.some((e) => ctx.exampleHasEntry?.get(e) === true);
    const detail = `benchValidators=[${[...validatorUnion].join(',')}] interactionBench=${hasInteractionBench} exampleOk=${exampleOk}`;
    return {
        scene: validatorUnion.has('scene-ready'),
        interaction: recipe.interactionSteps.length > 0 && hasInteractionBench,
        visual: validatorUnion.has('visible-frame'),
        lifecycle: validatorUnion.has('no-runtime-error'),
        detail,
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
}
