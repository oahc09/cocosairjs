/**
 * V0.6 §18 — ManualAgentDriver。
 *
 * 没有 Provider 集成时 Benchmark 仍可完整运行：
 * Runner 输出 Prompt → 人工交给任意 Agent → 导入修改 → Harness Build/Validate →
 * Feedback → 人工继续下一轮。
 *
 * 自动化路径（单测/G1 归因场景）：通过 scripted 注入动作序列驱动同一合同，
 * 保证 Manual 与 Provider Driver 走完全相同的 Harness 通路。
 */
import { AgentAction, AgentDriver, AgentRun, AgentRunResult, DriverContext, DriverInput, DriverTask } from './driver';

export class ManualAgentDriver implements AgentDriver {
    readonly id: string;

    private task: DriverTask | null = null;
    /** 脚本化动作队列：自动测试时逐个弹出作为 nextAction 的返回值。 */
    private scripted: AgentAction[] = [];
    /** 人工模式：Prompt 与待反馈的记录（外部进程读取/写入 scriptedActions.json 交互）。 */
    private readonly log: string[] = [];

    constructor (id = 'manual-A000') {
        this.id = id;
    }

    /** 注入脚本动作序列（自动化测试专用；人工模式不调用）。 */
    script (...actions: AgentAction[]): void {
        this.scripted.push(...actions);
    }

    /** 人工/脚本模式通用的动作追加入口（外部导入修改后由 Runner 提交）。 */
    push (action: AgentAction): void {
        this.log.push(`push:${action.type}`);
        this.scripted.push(action);
    }

    async startTask (context: DriverContext): Promise<AgentRun> {
        this.task = context.task;
        return {
            submitTask: async (task: DriverTask) => {
                this.task = task;
                this.log.push(`task:${task.benchmarkId}`);
            },
            nextAction: async (_input: DriverInput): Promise<AgentAction> => {
                const next = this.scripted.shift();
                if (!next) {
                    // 队列耗尽 = 人工模式尚未导入下一轮修改：按合同 finish（由 Runner 裁定结果）
                    return { type: 'finish', summary: 'manual: no more scripted actions (awaiting human input)' };
                }
                this.log.push(`next:${next.type}`);
                return next;
            },
            provideFeedback: async (feedback) => {
                this.log.push(`feedback:compile=${feedback.compile.success},validators=${feedback.validation.length},denied=${feedback.policy.denied.length}`);
            },
            finish: async (): Promise<AgentRunResult> => ({ summary: 'manual driver finished' }),
        };
    }

    /** 供 Reporter/调试读取的交互日志。 */
    transcript (): string[] {
        return [...this.log];
    }
}
