/**
 * V0.6 §48/§49 — Benchmark Schema 与 Catalog 加载。
 *
 * ID 段位：B001–B100 首批（§50 分类），发布后不复用；允许 deprecated/supersededBy。
 */

export type BenchmarkType = 'runtime-control' | 'source-create' | 'source-repair';

export interface BenchmarkDefinition {
    id: string;
    version: string;
    name: string;
    benchmarkType: BenchmarkType;
    category: string;
    difficulty: 'basic' | 'intermediate' | 'advanced';

    /** Agent Task Prompt（不含参考答案）。 */
    prompt: string;

    startingFixture: string;               // fixtures/ 下相对目录
    /** runtime-control：冻结操作脚本（由 Runner 以 Reference 身份执行）。 */
    referenceOperations?: unknown[];
    /** source-create/repair：冻结参考实现（Agent 不可见）。 */
    referenceImplementation?: string;      // protected/ 下相对路径

    writablePaths: string[];
    readablePaths: string[];
    protectedPaths: string[];

    allowedTools: string[];
    allowedCommands: { command: string; allowAnyArgs: boolean }[];
    allowedNetworkHosts: string[];

    knowledgeProfile: 'K0' | 'K1' | 'K2' | 'K3';

    validators: string[];
    validatorParams?: Record<string, Record<string, unknown>>;
    /** 视觉断言组合（frame-diff/visible-frame 由 Runner 供给帧数据）。 */
    visualValidators?: string[];

    capabilityRequirements: string[];
    browserRequirements: string;

    repairBudget: number;
    timeBudgetMs: number;

    expectedStates?: Record<string, unknown>;
    tags: string[];

    deprecated?: boolean;
    supersededBy?: string;
}

export function validateDefinition (def: BenchmarkDefinition): string[] {
    const errors: string[] = [];
    if (!/^B\d{3}$/.test(def.id)) { errors.push(`${def.id}: id must match B\\d{3}`); }
    if (!def.version) { errors.push(`${def.id}: version required`); }
    if (!def.prompt || def.prompt.length < 16) { errors.push(`${def.id}: prompt too short`); }
    if (def.benchmarkType !== 'runtime-control' && !def.referenceImplementation) {
        errors.push(`${def.id}: type B benchmark requires referenceImplementation`);
    }
    if (def.benchmarkType === 'runtime-control' && !def.referenceOperations?.length) {
        errors.push(`${def.id}: runtime-control requires referenceOperations`);
    }
    if (def.validators.length === 0) { errors.push(`${def.id}: at least one validator`); }
    for (const id of def.validators) {
        // 延迟校验：避免循环依赖（validators/index 未在此注册前不可用）
        if (!/^[a-z-]+$/.test(id)) { errors.push(`${def.id}: invalid validator id ${id}`); }
    }
    if (def.repairBudget < 0 || def.timeBudgetMs <= 0) { errors.push(`${def.id}: budgets invalid`); }
    return errors;
}

export interface Catalog {
    revision: string;
    benchmarks: BenchmarkDefinition[];
}

export function loadCatalog (catalog: Catalog): { catalog: Catalog; errors: string[] } {
    const errors: string[] = [];
    const seen = new Set<string>();
    for (const def of catalog.benchmarks) {
        if (seen.has(def.id)) { errors.push(`duplicate id ${def.id}`); }
        seen.add(def.id);
        if (def.deprecated && !def.supersededBy) { errors.push(`${def.id}: deprecated requires supersededBy`); }
        errors.push(...validateDefinition(def));
    }
    return { catalog, errors };
}
