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
    targetStatus?: RecipeStatus;
    /** 由 Recipe runner 实际执行的完整组合场景标识。 */
    compositeBenchmarkId: string;
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
    evidence?: RecipeEvidence[];
    benchmarkIds: Set<string>;
    exampleIds: Set<string>;
    validatorIds: Set<string>;
    /** §63 机器可读覆盖校验：benchmark 定义的 id → 类型/类别/validators。 */
    benchmarkDefs?: Map<string, BenchmarkCoverageInfo>;
    /** example 目录是否存在可运行入口（index.html）。 */
    exampleHasEntry?: Map<string, boolean>;
}

/** A single executed composite scenario, tied to the exact recipe version and requirements. */
export interface RecipeEvidence {
    recipeId: string;
    recipeVersion: string;
    source: { kind: 'benchmark' | 'example'; id: string; composite?: boolean };
    runId: string;
    revision: string;
    sourceHash: string;
    scenarioHash: string;
    measuredAt: string;
    environment: { browser: string; viewport: string; webglBackend: string };
    result: 'PASS' | 'FAIL';
    sceneSetup: string;
    requiredAssets: string[];
    requiredCapabilities: string[];
    runtimeState: string;
    interactionSteps: string[];
    visualTarget: string;
    checks: { scene: boolean; interaction: boolean; visual: boolean; lifecycle: boolean; noRuntimeErrors: boolean; capability: boolean; semantic: boolean };
    validatorResults: { validatorId: string; state: string; detail?: string }[];
    artifacts: { path: string; hash: string; bytes: number }[];
}

export interface EvidenceValidationOptions {
    sourceHash?: string;
    scenarioHashes?: Map<string, string>;
    artifactExists?: (path: string, hash: string, bytes: number) => boolean;
}

const allowedValidatorStates = new Set(['PASS', 'EXPECTED_UNSUPPORTED', 'EXPECTED_FALLBACK']);

export function validateEvidenceSet (
    recipes: RecipeDefinition[],
    evidence: RecipeEvidence[],
    options: EvidenceValidationOptions = {},
): string[] {
    const failures: string[] = [];
    const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
    const runIds = new Set<string>();
    for (const entry of evidence) {
        const prefix = entry?.recipeId || '<missing recipeId>';
        const required: (keyof RecipeEvidence)[] = ['recipeId', 'recipeVersion', 'source', 'runId', 'revision',
            'sourceHash', 'scenarioHash', 'measuredAt', 'environment', 'result', 'sceneSetup', 'requiredAssets',
            'requiredCapabilities', 'runtimeState', 'interactionSteps', 'visualTarget', 'checks', 'validatorResults', 'artifacts'];
        for (const field of required) {
            if (entry?.[field] === undefined || entry?.[field] === null || entry?.[field] === '') {
                failures.push(`${prefix}: evidence.${field} is required`);
            }
        }
        const recipe = recipesById.get(entry?.recipeId);
        if (!recipe) { failures.push(`${prefix}: unknown recipe`); continue; }
        if (entry.recipeVersion !== recipe.version) { failures.push(`${prefix}: recipeVersion mismatch`); }
        if (entry.source?.kind !== 'benchmark' || entry.source?.composite !== true
            || entry.source?.id !== recipe.compositeBenchmarkId) {
            failures.push(`${prefix}: source must be the executed composite benchmark ${recipe.compositeBenchmarkId}`);
        }
        if (!entry.runId) { failures.push(`${prefix}: missing runId`); }
        else if (runIds.has(entry.runId)) { failures.push(`${prefix}: duplicate runId ${entry.runId}`); }
        else { runIds.add(entry.runId); }
        if (options.sourceHash && entry.sourceHash !== options.sourceHash) { failures.push(`${prefix}: sourceHash mismatch`); }
        const expectedScenarioHash = options.scenarioHashes?.get(recipe.id);
        if (expectedScenarioHash && entry.scenarioHash !== expectedScenarioHash) { failures.push(`${prefix}: scenarioHash mismatch`); }
        if (!entry.environment?.browser || !entry.environment?.viewport || !entry.environment?.webglBackend) {
            failures.push(`${prefix}: incomplete environment`);
        }
        if (!Array.isArray(entry.validatorResults) || entry.validatorResults.length === 0) {
            failures.push(`${prefix}: validatorResults required`);
        } else {
            const states = new Map(entry.validatorResults.map((result) => [result.validatorId, result.state]));
            const requiredValidators = [...recipe.validatorRefs, ...recipe.visualRefs, 'recipe-semantic', 'recipe-capabilities', 'recipe-assets', 'recipe-interaction'];
            if (recipe.targetStatus === 'stable') { requiredValidators.push('resource-released'); }
            for (const id of requiredValidators) {
                if (!allowedValidatorStates.has(states.get(id) ?? '')) { failures.push(`${prefix}: validator ${id} did not pass`); }
            }
        }
        if (!Array.isArray(entry.artifacts) || entry.artifacts.length === 0) {
            failures.push(`${prefix}: artifacts required`);
        } else if (options.artifactExists) {
            for (const artifact of entry.artifacts) {
                if (!artifact?.path || !artifact?.hash || !Number.isFinite(artifact?.bytes)
                    || !options.artifactExists(artifact.path, artifact.hash, artifact.bytes)) {
                    failures.push(`${prefix}: artifact missing or hash mismatch (${artifact?.path ?? '<missing>'})`);
                }
            }
        }
    }
    return failures;
}

function coverageProof (recipe: RecipeDefinition, ctx: CoverageContext): boolean {
    return (ctx.evidence ?? []).some((e) => {
        const referenced = e.source.kind === 'benchmark'
            ? e.source.composite === true && e.source.id === recipe.compositeBenchmarkId
            : recipe.exampleRefs.includes(e.source.id) && ctx.exampleHasEntry?.get(e.source.id) === true;
        return referenced && e.recipeId === recipe.id && e.recipeVersion === recipe.version
            && !!e.runId && !!e.revision && e.result === 'PASS'
            && e.sceneSetup === recipe.sceneSetup && e.runtimeState === recipe.runtimeState
            && e.visualTarget === recipe.visualTarget
            && recipe.requiredAssets.every((x) => e.requiredAssets.includes(x))
            && recipe.requiredCapabilities.every((x) => e.requiredCapabilities.includes(x))
            && recipe.interactionSteps.every((x) => e.interactionSteps.includes(x))
            && e.checks.scene && e.checks.interaction && e.checks.visual && e.checks.semantic && e.checks.capability
            && e.checks.noRuntimeErrors && (recipe.targetStatus !== 'stable' || e.checks.lifecycle);
    });
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
            if (!coverageProof(recipe, ctx)) {
                dangling.push(`${recipe.id}: ${recipe.status} requires passing version-matched composite evidence`);
            }
        }
    }
    return dangling;
}

/** Evidence is the sole authority for moving draft recipes to their target state. */
export function promoteRecipes (recipes: RecipeDefinition[], ctx: CoverageContext): RecipeDefinition[] {
    return recipes.map((recipe) => {
        const candidate = { ...recipe, status: recipe.targetStatus ?? 'validated' } as RecipeDefinition;
        return coverageProof(candidate, ctx) ? candidate : { ...recipe, status: 'draft' };
    });
}
