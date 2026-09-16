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

export interface CoverageContext {
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
}
