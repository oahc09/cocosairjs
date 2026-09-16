/**
 * V0.6 §17/§21/§30 — Harness：AgentAction 的唯一执行入口。
 *
 * 文件读写 / patch 应用 / 受控命令 / runtime 请求全部经此；策略拒绝返回稳定
 * 错误码（计入 FeedbackPackage.policy.denied，Trial 仍然 VALID）。
 * runtime 通道（inspection/capture/error report）通过 dev 页面注入的
 * Agent Development Session（tools/debug）桥接。
 */
import * as fs from 'fs';
import { applyPatch } from './patch';
import { AgentAction } from '../driver/driver';
import { PolicyDeniedError, Policy } from './policy';
import { CommandSandbox, CommandResult } from './sandbox';
import { TrialWorkspace } from './workspace';

/** runtime 通道适配：Trial Runner 注入（jsdom/playwright 环境不同实现）。 */
export interface RuntimeChannel {
    inspect (query: Record<string, unknown>): Promise<unknown>;
    captureFrame (): Promise<{ png: string; width: number; height: number; sceneId: string; frameIndex: number }>;
    errorReport (query: { since?: number; limit?: number }): Promise<{ errors: unknown[]; dropped: number }>;
    /** runtime-control：执行冻结参考操作（Runner 以 Reference 身份调用）。 */
    executeReference? (op: Record<string, unknown>): Promise<unknown>;
}

export interface ActionOutcome {
    action: AgentAction;
    ok: boolean;
    denial?: { code: string; message: string };
    /** read-file 内容 / run-command 结果 / inspection 数据等。 */
    payload?: unknown;
}

export class Harness {
    readonly sandbox: CommandSandbox;
    private closed = false;
    private runtimeChannel: RuntimeChannel | null = null;
    readonly denials: { action: string; code: string; message: string }[] = [];

    constructor (private readonly workspace: TrialWorkspace, private readonly policy: Policy) {
        this.sandbox = new CommandSandbox(workspace.paths.workspace);
    }

    attachRuntime (channel: RuntimeChannel): void {
        this.runtimeChannel = channel;
    }

    async execute (action: AgentAction): Promise<ActionOutcome> {
        try {
            if (this.closed) { throw new PolicyDeniedError('POLICY_DENIED', 'Harness is closed'); }
            const payload = await this.dispatch(action);
            return { action, ok: true, payload };
        } catch (error) {
            if (error instanceof PolicyDeniedError) {
                const denial = { action: action.type, code: error.code, message: error.message };
                this.denials.push(denial);
                return { action, ok: false, denial };
            }
            return { action, ok: false, denial: { code: 'POLICY_DENIED', message: String(error instanceof Error ? error.message : error) } };
        }
    }

    private async dispatch (action: AgentAction): Promise<unknown> {
        switch (action.type) {
            case 'read-file': {
                const abs = this.policy.assertReadable(action.path);
                return fs.readFileSync(abs, 'utf8');
            }
            case 'write-file': {
                const abs = this.policy.assertWritable(action.path);
                fs.mkdirSync(abs.substring(0, Math.max(abs.lastIndexOf('\\'), abs.lastIndexOf('/'))), { recursive: true });
                fs.writeFileSync(abs, action.content, 'utf8');
                return { bytes: Buffer.byteLength(action.content) };
            }
            case 'patch-file': {
                const abs = this.policy.assertWritable(action.path);
                const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
                const after = applyPatch(before, action.diff);
                fs.writeFileSync(abs, after, 'utf8');
                return { bytes: Buffer.byteLength(after) };
            }
            case 'run-command': {
                const checked = this.policy.assertCommand(action.command, action.args ?? []);
                const result: CommandResult = await this.sandbox.run(checked.command, checked.args, {
                    cwd: this.workspace.paths.workspace,
                    timeoutMs: action.timeoutMs,
                });
                return {
                    ok: result.ok, timedOut: result.timedOut, exitCode: result.exitCode,
                    stdout: result.stdout, stderr: result.stderr,
                };
            }
            case 'request-runtime-inspection': {
                if (!this.runtimeChannel) { throw new PolicyDeniedError('POLICY_DENIED', 'runtime channel not attached'); }
                return this.runtimeChannel.inspect(action.query);
            }
            case 'request-frame-capture': {
                if (!this.runtimeChannel) { throw new PolicyDeniedError('POLICY_DENIED', 'runtime channel not attached'); }
                return this.runtimeChannel.captureFrame();
            }
            case 'request-error-report': {
                if (!this.runtimeChannel) { throw new PolicyDeniedError('POLICY_DENIED', 'runtime channel not attached'); }
                return this.runtimeChannel.errorReport({ since: action.since, limit: action.limit });
            }
            case 'finish':
                return { acknowledged: true };
            default:
                throw new PolicyDeniedError('POLICY_DENIED', `unknown action type: ${(action as { type: string }).type}`);
        }
    }

    async dispose (): Promise<void> {
        this.closed = true;
        await this.sandbox.dispose();
    }
}
