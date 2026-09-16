# -*- coding: utf-8 -*-
"""R5: policy.ts — sandbox flag schema hardening."""
import io

p = 'tools/benchmark/runner/policy.ts'
s = io.open(p, encoding='utf-8').read()

old = """/** eval 风格 flag = 任意代码执行等价物，与任意 Shell 同级禁止（§26）。 */
const EVAL_STYLE_FLAGS = new Set(['-e', '--eval', '-p', '--print', '-c', '--command', '--exec', '--interactive']);

const DEFAULT_DENY_COMMAND_FRAGMENTS = ["""
if "EVAL_STYLE_FLAGS = new Set(['-e', '--eval', '-p', '--print'" not in s:
    old = """/** eval 风格 flag = 任意代码执行等价物，与任意 Shell 同级禁止（§26）。 */
const EVAL_STYLE_FLAGS = new Set(['-e', '--eval', '-p', '--print', '-c', '--command']);"""
new = """/** eval 风格 flag = 任意代码执行等价物，与任意 Shell 同级禁止（§26）。
 *  同时覆盖 `--flag=value` 形态：先按 '=' 剥离再比对。 */
const EVAL_STYLE_FLAGS = new Set(['-e', '--eval', '-p', '--print', '-c', '--command', '--exec', '--interactive']);
/** 任意值都会改变加载/写出路徑的 flag：一律拒绝（值不可静态判定为安全）。 */
const PATH_OR_LOADER_FLAGS = new Set(['--require', '--import', '--prefix', '--cache', '--config', '--output', '--out-dir', '--outdir', '--root', '--out', '-o', '-r', '--loader', '--experimental-loader']);"""
assert old in s, 'flags decl'
s = s.replace(old, new, 1)

old = """        const raw = [command, ...args].join(' ');
        for (const flag of args) {
            if (EVAL_STYLE_FLAGS.has(flag)) {
                throw new PolicyDeniedError('COMMAND_NOT_ALLOWED', `eval-style flag is not allowed: ${flag} (equivalent to arbitrary code execution)`);
            }
        }
        for (const fragment of DEFAULT_DENY_COMMAND_FRAGMENTS) {
            if (raw.includes(fragment)) {
                throw new PolicyDeniedError('COMMAND_NOT_ALLOWED', `forbidden fragment '${fragment.trim()}' in: ${raw}`);
            }
        }
        if (!entry.allowAnyArgs) {
            for (const arg of args) {
                // 参数要么是 flag（- 开头），要么必须落在允许根内
                if (arg.startsWith('-')) { continue; }
                const resolved = this.abs(arg);
                if (!withinAny(resolved, this.roots(this.config.allowedPathRoots.length ? this.config.allowedPathRoots : this.config.writablePaths))) {
                    throw new PolicyDeniedError('PATH_OUT_OF_SCOPE', `command argument outside allowed roots: ${arg}`);
                }
            }
        }
        return { command, args };"""
new = """        const raw = [command, ...args].join(' ');
        for (const arg of args) {
            // '=' 形态先剥离：--eval=code / -e=code 与裸 flag 同罪
            const bare = arg.split('=')[0];
            if (EVAL_STYLE_FLAGS.has(arg) || EVAL_STYLE_FLAGS.has(bare)) {
                throw new PolicyDeniedError('COMMAND_NOT_ALLOWED', `eval-style flag is not allowed: ${arg} (equivalent to arbitrary code execution)`);
            }
            if (PATH_OR_LOADER_FLAGS.has(arg) || PATH_OR_LOADER_FLAGS.has(bare)) {
                throw new PolicyDeniedError('COMMAND_NOT_ALLOWED', `loader/path flag is not allowed: ${arg} (value cannot be statically validated)`);
            }
        }
        for (const fragment of DEFAULT_DENY_COMMAND_FRAGMENTS) {
            if (raw.includes(fragment)) {
                throw new PolicyDeniedError('COMMAND_NOT_ALLOWED', `forbidden fragment '${fragment.trim()}' in: ${raw}`);
            }
        }
        if (!entry.allowAnyArgs) {
            for (const arg of args) {
                if (arg.startsWith('-')) {
                    // '=' 形态：值若含路徑语义必须过 workspace 校验；否则拒绝
                    const eq = arg.indexOf('=');
                    if (eq > 0) {
                        const value = arg.slice(eq + 1);
                        const resolved = this.abs(value);
                        const roots = this.roots(this.config.allowedPathRoots.length ? this.config.allowedPathRoots : this.config.writablePaths);
                        if (!withinAny(resolved, roots)) {
                            throw new PolicyDeniedError('PATH_OUT_OF_SCOPE', `flag value outside allowed roots: ${arg}`);
                        }
                    }
                    // 无 '=' 的纯 flag 视为开关（不可携带隐藏路径）
                    continue;
                }
                const resolved = this.abs(arg);
                if (!withinAny(resolved, this.roots(this.config.allowedPathRoots.length ? this.config.allowedPathRoots : this.config.writablePaths))) {
                    throw new PolicyDeniedError('PATH_OUT_OF_SCOPE', `command argument outside allowed roots: ${arg}`);
                }
            }
        }
        return { command, args };"""
assert old in s, 'flag logic'
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('policy flags ok')
