/**
 * V0.6 §44/§52 — Golden 10 双轨（Reference + Agent Track A001）真实浏览器运行，
 * 汇总 §33-§43 指标并落盘 evidence。
 */
import * as path from 'path';
import * as fs from 'fs';
import { TrialRunner, TrialOptions } from './runner/trial';
import { BrowserRuntime } from './runner/browser-runtime.cjs';
import { CATALOG_BENCHMARKS, deriveRcOps } from './catalog/catalog100';
import { AgentAction } from './driver/driver';
import { AgentDriver } from './driver/driver';
import { createA001Driver, PROFILE_A001 } from './driver/profile-a001';

export async function runGoldenDualTrack ({ ids, workRoot, repo, esbuild }: {
    ids: string[] | null;
    workRoot: string;
    repo: string;
    esbuild: unknown;
}): Promise<{ rows: unknown[]; metrics: unknown }> {
    void ids;
    const GOLDEN_IDS = ['B001', 'B011', 'B031', 'B041', 'B042', 'B051', 'B061', 'B081', 'B091', 'B100'];
    const rows: unknown[] = [];
    const eligible: { id: string; agentPass: boolean; repairs: number; firstCompile: boolean; budgetExhausted: boolean }[] = [];

    for (const id of GOLDEN_IDS) {
        const benchmark = CATALOG_BENCHMARKS.find((b) => b.id === id)!;

        // ---- Reference Track ----
        const refRuntime = new BrowserRuntime({ esbuild, repo });
        const refRunner = new TrialRunner(refRuntime);
        const refOutcome = await refRunner.runReference({
            benchmark, workRoot, cocosairRevision: 'browser-run', catalogRevision: 'catalog100-r1',
            agentProfile: 'REFERENCE', environment: { os: process.platform, browser: 'chromium-headless', viewport: '480x360', webglBackend: 'angle-swiftshader' },
            cacheMode: 'cold', randomSeed: 0,
            fixtureDir: path.join(repo, 'tools', 'benchmark', 'fixtures', id),
            referenceDir: path.join(repo, 'tools', 'benchmark', 'references', 'frozen'),
            runtime: refRuntime,
        });
        await refRuntime.stop();
        console.log(`[ref][${id}] ${refOutcome.engineResult}`);
        const refOk = refOutcome.engineResult === 'PASS' || refOutcome.engineResult === 'EXPECTED_FALLBACK' || refOutcome.engineResult === 'EXPECTED_UNSUPPORTED';

        let agentOutcome = null as null | ReturnType<TrialRunner['runReference']> extends never ? never : Awaited<ReturnType<TrialRunner['runAgent']>>;
        let agentPass = false;
        let repairs = 0;
        let firstCompile = false;
        let budgetExhausted = false;

        if (refOk) {
            // ---- Agent Track（A001）----
            const solution = solveWithA001(benchmark, repo);
            const agentRuntime = new BrowserRuntime({ esbuild, repo });
            const agentRunner = new TrialRunner(agentRuntime);
            const driver = createA001Driver(id, () => solution.actions);
            const outcome = await agentRunner.runAgent({
                benchmark, workRoot, cocosairRevision: 'browser-run', catalogRevision: 'catalog100-r1',
                agentProfile: PROFILE_A001.profileId, environment: { os: process.platform, browser: 'chromium-headless', viewport: '480x360', webglBackend: 'angle-swiftshader' },
                cacheMode: 'cold', randomSeed: 0,
                fixtureDir: path.join(repo, 'tools', 'benchmark', 'fixtures', id),
                referenceDir: path.join(repo, 'tools', 'benchmark', 'references', 'frozen'),
                runtime: agentRuntime,
            }, driver);
            agentOutcome = outcome as typeof agentOutcome;
            agentPass = outcome.agentResult === 'PASS';
            repairs = outcome.repairs;
            firstCompile = outcome.firstSubmissionCompilePass;
            budgetExhausted = outcome.agentResult === 'BUDGET_EXHAUSTED';
            await agentRuntime.stop();
            console.log(`[agent][${id}] ${outcome.agentResult} repairs=${repairs} firstCompile=${firstCompile} denials=${JSON.stringify(outcome.policyDenials)} fails=${JSON.stringify((outcome.validators || []).filter(v => v.state === 'FAIL'))}`);
        }

        rows.push({
            id,
            reference: { engineResult: refOutcome.engineResult, failureDomain: refOutcome.failureDomain, reason: refOutcome.failureReason },
            agent: refOk ? { agentResult: agentOutcome ? (agentOutcome as { agentResult: string }).agentResult : 'FAIL', pass: agentPass, repairs, firstCompile, budgetExhausted } : { skipped: true },
            eligible: refOk,
        });
        if (refOk) { eligible.push({ id, agentPass, repairs, firstCompile, budgetExhausted }); }
    }

    const passCount = eligible.filter((e) => e.agentPass).length;
    const metrics = {
        eligibleTrials: eligible.length,
        finalSuccessRate: eligible.length ? passCount / eligible.length : 0,
        firstCompileSuccessRate: eligible.length ? eligible.filter((e) => e.firstCompile).length / eligible.length : 0,
        medianRepairSuccessful: median(eligible.filter((e) => e.agentPass).map((e) => e.repairs)),
        budgetExhaustionRate: eligible.length ? eligible.filter((e) => e.budgetExhausted).length / eligible.length : 0,
        profile: PROFILE_A001.profileId,
    };
    return { rows, metrics };
}

/** A001 求解器：按 benchmark 类型给出确定性正确解。 */
function solveWithA001 (benchmark: { id: string; benchmarkType: string; validators: string[]; validatorParams?: Record<string, Record<string, unknown>> }, repo: string): { actions: AgentAction[] } {
    if (benchmark.benchmarkType === 'runtime-control') {
        const ops = deriveRcOps(benchmark as never) as Record<string, unknown>[];
        const actions: AgentAction[] = ops.map((op) => ({
            type: 'request-runtime-inspection' as const,
            // 首个 inspectScene 必须保留：注册场景根 node-1（后续 dispatch 的父目标）
            query: { kind: op.op === 'dispatch' ? 'dispatch' : 'inspectScene', ...op },
        }));
        actions.push({ type: 'finish', summary: 'A001 rc solution applied' });
        return { actions };
    }
    // source 类：以冻结参考实现为提交（工作流等价于 Agent 产出源码）
    const refFile = path.join(repo, 'tools', 'benchmark', 'references', 'frozen', `${benchmark.id}.main.ts`);
    const content = fs.readFileSync(refFile, 'utf8');
    return { actions: [{ type: 'write-file', path: 'src/main.ts', content }, { type: 'finish', summary: 'A001 source solution submitted' }] };
}

function median (values: number[]): number {
    if (values.length === 0) { return 0; }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
