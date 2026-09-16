/**
 * V0.6 §33-43 — eligible_trials / Repair 指标 / Run Manifest。
 *
 * eligible_trials 语义是唯一实现点（§33-35）：
 *   Eligible = 所有实际启动 Agent Track 的 VALID Trials − Approved Non-blocking SKIP。
 * INFRA_FAILURE / INVALID_RUN / Contractual Device Unsupported 不进分母。
 */
import { sha256 } from './policy';

export type TrialTopResult = 'VALID' | 'INFRA_FAILURE' | 'INVALID_RUN';
export type EngineResult = 'PASS' | 'FAIL' | 'EXPECTED_UNSUPPORTED' | 'EXPECTED_FALLBACK' | 'SKIP' | 'NOT_EVALUATED';
export type AgentResult = 'PASS' | 'FAIL' | 'BUDGET_EXHAUSTED' | 'TIMEOUT' | 'SKIP' | 'NOT_EVALUATED';
export type FailureDomain = 'ENGINE' | 'AGENT' | 'INFRASTRUCTURE' | 'ISOLATION' | 'DEVICE' | 'NONE';

export interface RunManifest {
    cocosairRevision: string;
    benchmarkCatalogRevision: string;
    benchmarkId: string;
    benchmarkVersion: string;
    startingFixtureHash: string;
    referenceImplementationHash: string;
    os: string;
    browser: string;
    viewport: string;
    webglBackend: string;
    agentProfile: string;
    knowledgeProfile: string;
    allowedTools: string[];
    allowedCommands: string[];
    networkPolicy: string;
    repairBudget: number;
    timeBudgetMs: number;
    cacheMode: 'cold' | 'warm';
    randomSeed: number;
}

export interface TrialRecord {
    manifest: RunManifest;
    trialResult: TrialTopResult;
    engineResult: EngineResult;
    agentResult: AgentResult;
    failureDomain: FailureDomain;
    /** §13：Agent 失败细分（compile/runtime/visual/wrong-result/timeout/budget/gave-up/policy）。 */
    failureReason?: string;
    /** SKIP 必须有原因 + 是否 blocking（§9/§35）。 */
    skip?: { reason: string; blocking: boolean };
    repairs: number;
    firstSubmissionCompilePass: boolean;
    /** 非 blocking 且经批准的 SKIP 才能移出分母（§33）。 */
    approvedNonBlockingSkip?: boolean;
    policyDenials: { action: string; code: string; message: string }[];
}

/** 从单条 Trial 判定是否进入 eligible_trials 分母（§33-35 唯一实现）。 */
export function isEligible (trial: TrialRecord): boolean {
    if (trial.trialResult !== 'VALID') { return false; }
    if (trial.approvedNonBlockingSkip) { return false; }
    return true;
}

export interface AggregatedMetrics {
    eligibleTrials: number;
    agentPass: number;
    agentFinalSuccessRate: number;
    firstCompileSuccessRate: number;
    medianRepairSuccessful: number;
    meanRepairAllEligible: number;
    budgetExhaustionRate: number;
    byDomain: Record<string, number>;
}

function median (values: number[]): number {
    if (values.length === 0) { return 0; }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function aggregate (trials: TrialRecord[]): AggregatedMetrics {
    const eligible = trials.filter(isEligible);
    const agentTrials = eligible.filter((t) => t.agentResult !== 'NOT_EVALUATED' && t.agentResult !== 'SKIP');
    const pass = agentTrials.filter((t) => t.agentResult === 'PASS');
    const budgetExhausted = agentTrials.filter((t) => t.agentResult === 'BUDGET_EXHAUSTED');
    const firstCompile = eligible.filter((t) => t.firstSubmissionCompilePass);
    const byDomain: Record<string, number> = {};
    for (const trial of trials) {
        byDomain[trial.failureDomain] = (byDomain[trial.failureDomain] || 0) + 1;
    }
    return {
        eligibleTrials: eligible.length,
        agentPass: pass.length,
        agentFinalSuccessRate: agentTrials.length ? pass.length / agentTrials.length : 0,
        firstCompileSuccessRate: eligible.length ? firstCompile.length / eligible.length : 0,
        medianRepairSuccessful: median(pass.map((t) => t.repairs)),
        meanRepairAllEligible: eligible.length
            ? eligible.reduce((sum, t) => sum + t.repairs, 0) / eligible.length
            : 0,
        budgetExhaustionRate: agentTrials.length ? budgetExhausted.length / agentTrials.length : 0,
        byDomain,
    };
}

/** §43：对 fixtureRoot 建立排序稳定的递归 manifest，整体員希作为 startingFixtureHash。 */
export function computeFixtureManifestHash (fixtureRoot: string): string {
    const fs = require('fs') as typeof import('fs');
    const pathMod = require('path') as typeof import('path');
    const cryptoMod = require('crypto') as typeof import('crypto');
    const entries: string[] = [];
    const walk = (dir: string, prefix: string): void => {
        if (!fs.existsSync(dir)) { return; }
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const rel = prefix ? prefix + '/' + entry.name : entry.name;
            if (entry.isDirectory()) { walk(pathMod.join(dir, entry.name), rel); } else {
                entries.push(rel + ':' + cryptoMod.createHash('sha256').update(fs.readFileSync(pathMod.join(dir, entry.name))).digest('hex'));
            }
        }
    };
    walk(fixtureRoot, '');
    entries.sort();
    return cryptoMod.createHash('sha256').update(entries.join('|') || '<empty>').digest('hex');
}

export function writeManifest (file: string, manifest: RunManifest, fixtureRoot: string): void {
    const fs = require('fs') as typeof import('fs');
    // §43：startingFixtureHash 必频来自真实 fixture 内容
    const withHash = { ...manifest, startingFixtureHash: computeFixtureManifestHash(fixtureRoot) };
    fs.writeFileSync(file, JSON.stringify(withHash, null, 2) + '\n', 'utf8');
    void fixtureRoot;
}
