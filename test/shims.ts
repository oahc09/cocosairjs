// 最小 node 运行时绑定：jest(浏览器环境) 下 node 内建模块经 CJS wrapper 的 require 获取。
// 类型由 test/tsconfig.jest.json 提供（@types/node）。
export const nodeRequire: NodeRequire = require;
export const nodeProcess: NodeProcess = process;

export interface NodeRequire {
    (id: string): any; // eslint-disable-line
}
export interface NodeProcess {
    platform: string;
    execPath: string;
    cwd (): string;
    env: Record<string, string | undefined>;
}
