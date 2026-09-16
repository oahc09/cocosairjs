/**
 * V0.6 §40/§41 — Reference Agent Profile A001（正式运行前冻结）。
 *
 * A001 = ManualAgentDriver 脚本化求解档：
 *  - model: "scripted-reference-solver"（无 LLM；Provider Adapter 接入后以 A002+ 冻结新 Profile）
 *  - 解法来源：source 类直接以冻结参考实现内容为提交（等价于"完美 Agent"）；
 *    runtime-control 类按 deriveRcOps 的确定性操作序列经 Harness 执行。
 *  - Repair Budget 5 / Time Budget 20min / temperature n/a。
 *
 * A001 的用途：验证 Agent Track 工作流闭环与指标体系（§46 G1）。
 * 不代表 LLM Agent 能力水平——后者由未来冻结的 Provider Profile（A002+）测量。
 */
import { AgentAction, AgentDriver, AgentRun, DriverContext, DriverTask } from './driver';
import { ManualAgentDriver } from './manual-driver';

export interface AgentProfileRecord {
    profileId: string;
    driver: string;
    model: string;
    modelVersion: string;
    systemInstruction: string;
    knowledgeProfile: string;
    allowedTools: string[];
    repairBudget: number;
    randomness: 'n/a (scripted)';
}

export const PROFILE_A001: AgentProfileRecord = {
    profileId: 'A001',
    driver: 'ManualAgentDriver(scripted)',
    model: 'scripted-reference-solver',
    modelVersion: 'v06-r1',
    systemInstruction: '按 Benchmark Prompt 生成最小正确解；所有动作经 Harness；遇策略拒绝修正自身行为。',
    knowledgeProfile: 'K2',
    allowedTools: ['read-file', 'write-file', 'patch-file', 'run-command', 'request-runtime-inspection', 'request-frame-capture', 'request-error-report', 'finish'],
    repairBudget: 5,
    randomness: 'n/a (scripted)',
};

/** 生成 A001 驱动（solutionProvider 给出该 benchmark 的"正确解"动作序列）。 */
export function createA001Driver (
    benchmarkId: string,
    solutionProvider: (id: string) => AgentAction[],
): AgentDriver {
    const driver = new ManualAgentDriver(PROFILE_A001.profileId);
    const actions = solutionProvider(benchmarkId);
    driver.script(...actions);
    return {
        id: PROFILE_A001.profileId,
        startTask: (context: DriverContext) => driver.startTask(context),
    };
}

export function createA001Run (driver: AgentDriver): Promise<AgentRun> {
    void driver;
    throw new Error('use driver.startTask(context) directly');
}
