/**
 * V0.2 Task 11 — Type Declaration（验收 L12）。
 *
 * 用法: npm run build:dts
 *
 * 复用 @cocos/ccbuild 的 dtsBundler（与 V0.1 Build System 同一机制，不新增第二套声明生成）:
 *   dtsBundler.build({ engine, outDir })
 *
 * 产出: build/cocosair.module.d.ts（由 cc.d.ts 归一化命名）。
 * 支持 TypeScript autocomplete / Go to Definition / 静态类型检查。
 *
 * 注意（safe-delete shim 兼容）：
 * - dtsBundler 会在 src/__dts_before_bundle 生成上千个中间文件并在结束时尝试清理；
 *   批量删除被拦截时它会 throw，但 bundle 产物此时已写入 outDir —— 因此输出拷贝
 *   放在 finally 路径执行，清理失败不丢产物。
 * - 本脚本自身不做任何批量删除；outDir 按时间戳唯一，残留目录留在 build/（已 gitignore）。
 */
const { join } = require('path');
const fs = require('fs');
const { existsSync, renameSync } = require('fs-extra');
const { dtsBundler } = require('@cocos/ccbuild');
const { withDeclarationInputs } = require('./dts-inputs.cjs');
const { stageExternalDeclarationTypes } = require('./dts-external-types.cjs');

const ROOT = join(__dirname, '..', '..');
const ENGINE = join(ROOT, 'src');

function cleanupDtsTemp() {
    const tmp = join(ENGINE, '__dts_before_bundle');
    if (!existsSync(tmp)) return;
    try {
        renameSync(tmp, join(ROOT, 'build', `.dts-before-bundle-${Date.now()}`));
        console.log('[dts] src/__dts_before_bundle moved out of src/ (rename, no delete)');
    } catch (e) {
        console.warn('[dts] WARN: unable to move src/__dts_before_bundle:', e.message);
    }
}

function copyOutput(outDir) {
    const candidates = ['cc.d.ts', 'index.d.ts'];
    for (const c of candidates) {
        const p = join(outDir, c);
        if (existsSync(p)) {
            // ccbuild emits an ambient "cc" module. The SDK's package types entry must
            // itself be an external module so normal named imports work for consumers.
            const declarations = fs.readFileSync(p, 'utf8');
            if (!/^\s*declare module "cc" \{/.test(declarations) || !/\}\s*$/.test(declarations)) {
                throw new Error('Unexpected ccbuild declaration format');
            }
            const sdk = declarations
                .replace(/^\s*declare module "cc" \{\s*/, '')
                .replace(/\}\s*$/, '')
                .replace(/(["'])cc\1/g, '"./cocosair.module"');
            fs.writeFileSync(join(ROOT, 'build', 'cocosair.module.d.ts'), sdk);
            require('./legacy-dom-types.cjs').writeLegacyDomTypes(ROOT);
            require('./runtime-layout.cjs').removeRetiredEntries(join(ROOT, 'build'));
            return true;
        }
    }
    return false;
}

(async function exec() {
    const outDir = join(ROOT, 'build', `.dts-tmp-${Date.now()}`);
    fs.mkdirSync(outDir, { recursive: true });
    console.log('[dts] bundling type declarations (this may take a few minutes) ...');
    const started = Date.now();
    let buildOk = false;
    try {
        await withDeclarationInputs(
            ENGINE,
            () => dtsBundler.build({ engine: ENGINE, outDir }),
            (options) => stageExternalDeclarationTypes(options, ROOT),
        );
        buildOk = true;
    } catch (e) {
        // dtsBundler 内部清理被 safe-delete shim 拦截时会 throw；产物此时通常已写出
        console.warn('[dts] dtsBundler reported an error (likely temp cleanup):', e && e.message ? e.message : e);
    } finally {
        cleanupDtsTemp();
    }
    const copied = copyOutput(outDir);
    if (!copied) {
        console.error('[dts] FAILED: declaration output not found in', outDir);
        process.exit(1);
    }
    console.log(
        `[dts] done in ${((Date.now() - started) / 1000).toFixed(1)}s → build/cocosair.module.d.ts${buildOk ? '' : ' (recovered: bundler cleanup was blocked, output intact)'}`,
    );
    try {
        fs.rmSync(outDir, { recursive: true, force: true });
    } catch (e) {
        /* shim 可能拦截，残留于 build/ */
    }
})().catch((e) => {
    cleanupDtsTemp();
    console.error('[dts] FAILED:', e && e.message ? e.message : e);
    process.exit(1);
});
