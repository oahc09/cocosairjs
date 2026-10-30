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
 * 默认 feature 集与 JS 构建同源；输出恢复类型专用出口并保留私有类型引用。
 * 清理恢复仅限唯一 bundle 已完成、产物有效、错误明确指向临时声明目录删除的情况。
 * 语义/生成错误或 false 返回值一律失败，即使目录里已有输出也不视为成功。
 * 拒绝删除的目录保留，不通过重试删除或改名规避限制。正常完成后清理本次输出临时目录。
 * 另写 build/dts-contract.json（生成器默认 feature/入口/type-value 合同，不随 npm 发布）。
 */
const { join } = require('path');
const fs = require('fs');
const { existsSync, renameSync } = require('fs-extra');
const { dtsBundler } = require('@cocos/ccbuild');
const {
    withMainDeclarations,
    reconcileExports,
    normalizeSdkSelfReferences,
    runDeclarationBuild,
} = require('./upstream-dts-surface.cjs');

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

function copyOutput(outDir, receipt) {
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
            const sdk = normalizeSdkSelfReferences(
                declarations.replace(/^\s*declare module "cc" \{\s*/, '').replace(/\}\s*$/, ''),
            );
            if (!receipt.surface) throw new Error('Missing main declaration export contract');
            const normalized = reconcileExports(sdk, receipt.surface);
            fs.writeFileSync(join(ROOT, 'build', 'cocosair.module.d.ts'), normalized);
            fs.writeFileSync(join(ROOT, 'build', 'dts-contract.json'), JSON.stringify(receipt, null, 2) + '\n');
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
    const receipt = { schema: 'air-main-dts-contract/1' };
    const buildResult = await runDeclarationBuild(
        () => withMainDeclarations(ROOT, () => dtsBundler.build({ engine: ENGINE, outDir }), receipt),
        { receipt, outDir, temporaryDir: join(ENGINE, '__dts_before_bundle') },
    );
    buildOk = !buildResult.recoveredCleanup;
    if (buildResult.recoveredCleanup) {
        receipt.recoveredCleanup = { code: buildResult.code, syscall: buildResult.syscall };
        console.warn(
            '[dts] completed bundle retained after verified temporary-file cleanup failure:',
            buildResult.code,
        );
        // Do not retry a denied deletion or move the denied target to evade it.
    } else cleanupDtsTemp();
    const copied = copyOutput(outDir, receipt);
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
    // Retain intermediates on generation/semantic errors; no cleanup fallback can turn them into success.
    console.error('[dts] FAILED:', e && e.message ? e.message : e);
    process.exit(1);
});
