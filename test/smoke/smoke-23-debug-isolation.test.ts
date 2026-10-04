/**
 * Smoke 23 — V0.5.1 依赖图守卫（计划书 §7/§9.1）。
 *
 * 默认运行时包不得包含 debug/agent 模块：按真实构建输出检查（不是按文件名搜索），
 * 同时检查 npm 包文件清单（files 白名单）不含 tools/。
 * 前置：build 产物已生成（强制命令顺序 build → test）。
 */
// jest 环境未装 @types/node：用最小环境声明读取构建产物（守卫必须看真实输出）。
declare const process: { cwd (): string };
declare const require: (id: string) => any; // eslint-disable-line
const fs = require('fs');
const path = require('path');

export {};
const ROOT = process.cwd();
const BUNDLE = path.join(ROOT, 'build', 'cocosair.module.js');

/** tools/debug 中稳定存在、且默认 runtime 不应出现的标识。 */
const DEBUG_MARKERS = [
    'createAgentSession',
    'AgentSessionImpl',
    'STALE_TARGET',
    'SESSION_CLOSED',
    '__airErrorHub',
];

describe('debug/agent 模块与默认 runtime 隔离', () => {
    test('默认 bundle 不包含 agent session / debug panel 标识（真实输出检查）', () => {
        expect(fs.existsSync(BUNDLE)).toBe(true);
        const source = fs.readFileSync(BUNDLE, 'utf8');
        for (const marker of DEBUG_MARKERS) {
            // Runtime scopes expose AIR_E_SESSION_CLOSED. The optional inspector
            // uses the distinct standalone SESSION_CLOSED code; keep detecting it.
            if (marker === 'SESSION_CLOSED') {
                expect(source).not.toMatch(/\bSESSION_CLOSED\b/);
            } else {
                expect(source.includes(marker)).toBe(false);
            }
        }
    });

    test('npm 包 files 白名单不含 tools/debug（tarball 内容与 consumer 审计一致）', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
        const files: string[] = pkg.files ?? [];
        expect(files.some((f) => f === 'tools' || f.startsWith('tools/') || f === 'test' || f === 'src')).toBe(false);
        // eslint 在 repo 的 tools/debug 源码存在，但不会进入包
        expect(fs.existsSync(path.join(ROOT, 'tools', 'debug', 'agent-session.ts'))).toBe(true);
    });

    test('examples 不静态引用 /__debug/（仅动态 import，路径可为表达式以避免 bundler 解析）', () => {
        const walk = (dir: string): string[] => {
            const out: string[] = [];
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) { out.push(...walk(full)); } else if (entry.name === 'main.ts' || entry.name === 'main.js') { out.push(full); }
            }
            return out;
        };
        for (const file of walk(path.join(ROOT, 'examples'))) {
            const source = fs.readFileSync(file, 'utf8');
            if (source.includes('__debug')) {
                // 仅允许动态 import 形态（dev server 专属、显式启用）；
                // 路径可用运行时表达式拼接（esbuild 不可静态折叠），静态 from/require 引用一律禁止。
                expect(source).toMatch(/import\(/);
                expect(source).not.toMatch(/from\s+['"`][^'"`]*__debug/);
                expect(source).not.toMatch(/require\(\s*['"`][^'"`]*__debug/);
            }
        }
    });
});
