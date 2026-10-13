// SPK-04 math-parity 专用 jest 配置。
// 独立于根 jest.config.js：默认 testMatch（test/smoke/*.test.ts）不受影响，
// `npm test` 不会跑到本用例；仅由 tools/verify/spark-math-parity.cjs 显式调用。
//
// 唯一新增的解析规则是把 `three` 指向「隔离参考安装」
// output/spark-math-parity/node_modules/three（npm install --prefix，不进仓库根 node_modules）。
// Three.js 只作为 oracle 出现在本验证回路里，目标运行时代码不引用它（计划 §1.3 边界）。
const fs = require('fs');
const path = require('path');

const base = require('../jest.config.js');

const repoRoot = path.resolve(__dirname, '..');
const isolatedPrefix = process.env.SPARK_MATH_PARITY_THREE_PREFIX
    ? path.resolve(process.env.SPARK_MATH_PARITY_THREE_PREFIX)
    : path.join(repoRoot, 'output', 'spark-math-parity');
const threeEntry = path.join(isolatedPrefix, 'node_modules', 'three', 'build', 'three.cjs');

if (!fs.existsSync(threeEntry)) {
    throw new Error(
        `[spark-math-parity] 未找到隔离的 Three.js 参考安装：${threeEntry}\n` +
            `请先执行： npm install three@0.180.0 --prefix output/spark-math-parity --no-save --no-package-lock\n` +
            `或直接运行： node tools/verify/spark-math-parity.cjs（该工具会自动补装）`,
    );
}

module.exports = {
    ...base,
    rootDir: repoRoot,
    testMatch: ['<rootDir>/test/parity/*.test.ts'],
    moduleNameMapper: {
        ...base.moduleNameMapper,
        '^three$': threeEntry,
    },
};
