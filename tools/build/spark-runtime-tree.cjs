#!/usr/bin/env node
/**
 * SPK-11：从冻结的 `vendor/spark/src/**` 生成 AIR 侧 Spark 运行时子图。
 *
 *   node tools/build/spark-runtime-tree.cjs            # 生成
 *   node tools/build/spark-runtime-tree.cjs --check    # 只校验盘面产物与清单一致
 *
 * 形态依据（均为本仓既有先例，不新造机制）：
 * - esbuild 预打包第三方/冻结源码树 → 单个 ESM 文件：`tools/build/vendor-package-esm.cjs`；
 * - 可选入口独立于默认 bundle：`tools/build/html-source-entry.cjs` + `package.json` `./html-source`；
 * - specifier 改写（`three` → 兼容层、wasm 字节内联、`.glsl` 文本、`?worker&inline` 内联 Worker）：
 *   移植件 `spark-cocosairjs/tools/build.mjs`（只读参照）。
 *
 * 计划约束（`ai/plans/spark-integration.md`）：
 * - §SPK-10：`SparkXr.ts` / `hands.ts` 不进运行时子图与公开导出 —— 由生成入口删除其导出条目，
 *   并在下条断言中硬核验（`metafile.inputs` 不得出现这两个文件）；
 * - §1.3 / §SPK-02：2.7 MB 冻结本体不进默认 bundle —— 产物只经 `spark` 可选 feature unit 接入；
 * - §SPK-11：`spark_rs_bg.wasm` 以构建期内联字节发运，不引入运行时 fetch；
 * - `three` specifier 指向 `src/air/spark/spark-api-adapter.ts`（计划 §2.1 line 78 判定 21+3 站点为
 *   不可改基线），保持 external 以免引擎对象在 bundle 内被复制。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..', '..');
const VENDOR_SPARK = path.join(ROOT, 'vendor', 'spark', 'src');
const VENDOR_SPARK_RS = path.join(ROOT, 'vendor', 'spark-rs');
const FFLATE_ENTRY = path.join(ROOT, 'build', 'fflate', 'esm', 'browser.js');
const OUT_DIR = path.join(ROOT, 'src', 'air', 'spark', 'generated');
const OUT_JS = path.join(OUT_DIR, 'spark-runtime.js');
const OUT_DTS = path.join(OUT_DIR, 'spark-runtime.d.ts');
const MANIFEST = path.join(ROOT, 'output', 'spark-runtime-tree-manifest.json');

// 相对产物文件指向适配层；生成期由打包器解析为 src/air/spark/spark-api-adapter.ts。
const ADAPTER_SPECIFIER = '../spark-api-adapter';
const EXCLUDED_MODULES = ['SparkXr', 'hands'];

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const fail = (msg) => {
    console.error('[spark-runtime-tree] FAIL ' + msg);
    process.exitCode = 1;
    throw new Error(msg);
};

// ---------- 1. 生成入口：冻结 index.ts 的导出面，剔除 XR/hands ----------
function buildEntrySource() {
    const indexPath = path.join(VENDOR_SPARK, 'index.ts');
    if (!fs.existsSync(indexPath)) fail('missing frozen vendor/spark/src/index.ts');
    const lines = fs.readFileSync(indexPath, 'utf8').split(/\r?\n/);
    const kept = [];
    let buffer = null;
    for (const line of lines) {
        if (buffer !== null) {
            buffer.push(line);
            if (/\bfrom\s+['"][^'"]+['"];?\s*$/.test(line)) {
                const stmt = buffer.join('\n');
                if (!EXCLUDED_MODULES.some((m) => new RegExp(['"', './' + m + '"'].join('')).test(stmt)))
                    kept.push(stmt);
                buffer = null;
            }
            continue;
        }
        if (/^export\b/.test(line)) {
            if (/\bfrom\s+['"][^'"]+['"];?\s*$/.test(line)) {
                if (!EXCLUDED_MODULES.some((m) => line.includes(['"', './' + m + '"'].join('')))) kept.push(line);
            } else {
                buffer = [line];
            }
            continue;
        }
        kept.push(line);
    }
    const dropped = lines.filter((l) => EXCLUDED_MODULES.some((m) => l.includes(['"', './' + m + '"'].join(''))));
    return { source: kept.join('\n'), dropped };
}

// ---------- 2. 声明面：从保留的导出枚举值名，产出 .d.ts 的冻结 JS 边界 ----------
function exportedValueNames(entrySource) {
    const names = new Set();
    const namespace = new Set();
    for (const m of entrySource.matchAll(/^export\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/gm)) {
        namespace.add(m[1]);
    }
    for (const m of entrySource.matchAll(/^export\s*\{([^}]*)\}\s*from\s+['"]([^'"]+)['"]/gms)) {
        for (const part of m[1].replace(/\s+/g, ' ').split(',')) {
            const t = part.trim();
            if (!t) continue;
            if (/^type\b/.test(t)) continue;
            const name = t
                .split(/\s+as\s+/)
                .pop()
                .trim();
            if (name) names.add(name);
        }
    }
    for (const m of entrySource.matchAll(/^export\s+\*\s+from\s+['"](\.[^'"]+)['"]/gm)) {
        const base = path.join(VENDOR_SPARK, m[1]);
        for (const cand of [base + '.ts', path.join(base, 'index.ts')]) {
            if (!fs.existsSync(cand)) continue;
            const s = fs.readFileSync(cand, 'utf8');
            for (const n of s.matchAll(
                /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:class|const|let|var|function|enum)\s+([A-Za-z_$][\w$]*)/gm,
            ))
                names.add(n[1]);
            for (const n of s.matchAll(/^export\s*\{([^}]*)\}/gms)) {
                for (const part of n[1].replace(/\s+/g, ' ').split(',')) {
                    const t = part.trim();
                    if (!t || /^type\b/.test(t)) continue;
                    names.add(
                        t
                            .split(/\s+as\s+/)
                            .pop()
                            .trim(),
                    );
                }
            }
            break;
        }
    }
    return { names: [...names].sort(), namespace: [...namespace].sort() };
}

function buildDts(entrySource) {
    const { names, namespace } = exportedValueNames(entrySource);
    const banner = [
        '/*',
        ' Copyright (c) 2026-2027 oahc09@gmail.com',
        '',
        ' Permission is hereby granted, free of charge, to any person obtaining a copy',
        ' of this software and associated documentation files (the "Software"), to deal',
        ' in the Software without restriction, including without limitation the rights',
        ' to use, copy, modify, merge, publish, distribute, sublicense, and/or sell',
        ' copies of the Software, and to permit persons to whom the Software is',
        ' furnished to do so, subject to the following conditions:',
        '',
        ' The above copyright notice and this permission notice shall be included in',
        ' all copies or substantial portions of the Software.',
        '',
        ' THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
        ' IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,',
        ' FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE',
        ' AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER',
        ' LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,',
        ' OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN',
        ' THE SOFTWARE.',
        '*/',
        '/**',
        ' * SPK-11 生成物：冻结 Spark 运行时子图（`vendor/spark/src/**` 经 esbuild 预打包）的类型边界。',
        ' *',
        ' * 边界说明（勿手改，改生成器 `tools/build/spark-runtime-tree.cjs`）：',
        ' * - 运行时值全部来自冻结上游，本仓不重导出其 TS 类型面，以免 182 处上游类型错误进入本仓 tsc 程序',
        ' *   （该接入形态的判定与证据见 `ai/ledgers/spark-integration.md` SPK-11 条目）；',
        ' * - 相对上游 `index.ts` 的导出面已按 §SPK-10 收窄：剔除 `SparkXr` 与 `hands`（XR 会话/手部子图），',
        ' *   复议条件同计划；生成期以 `metafile.inputs` 断言两者确实未进入子图；',
        ' * - 此处标为 `any` 的符号即打包器在构建期校验过的运行时可用面，AIR 集成层按需再包一层带类型的门面。',
        ' */',
    ].join('\n');
    const body = [
        // 每个运行时值同时给出值与类型别名：冻结树以 JS 发运，集成层既有 `new SplatMesh()` 的取值用法，
        // 也有 `mesh: SplatMesh` 的标注用法，二者都落在同一条 `any` 边界上。
        ...names.flatMap((n) => ['export declare const ' + n + ': any;', 'export type ' + n + ' = any;']),
        ...namespace.map((n) => 'export declare const ' + n + ': Record<string, any>;'),
    ].join('\n');
    return banner + '\n' + body + '\n';
}

// ---------- 3. esbuild 插件：specifier 改写 ----------
function sparkPlugin({ workerMode }) {
    return {
        name: 'air-spark-runtime-tree',
        setup(build) {
            // wasm 字节构建期内联（无运行时 fetch）。
            build.onResolve({ filter: /spark_rs_bg\.wasm\?arraybuffer&base64$/ }, () => ({
                path: path.join(VENDOR_SPARK_RS, 'spark_rs_bg.wasm'),
                namespace: 'air-wasm-bytes',
            }));
            build.onLoad({ filter: /.*/, namespace: 'air-wasm-bytes' }, async (args) => ({
                contents: await fs.promises.readFile(args.path),
                loader: 'binary',
            }));
            // wasm-bindgen 胶水（冻结，自身无硬编码 wasm 路径）。
            build.onResolve({ filter: /^spark-rs$/ }, () => ({ path: path.join(VENDOR_SPARK_RS, 'spark_rs.js') }));
            // fflate 走本仓独立资产目录（build/gltf-decoders 同族先例）。
            build.onResolve({ filter: /^fflate$/ }, () => ({ path: FFLATE_ENTRY }));
            // .glsl 以文本内联（8 个着色器文件属 SPK-03 冻结树）。
            build.onLoad({ filter: /\.glsl$/ }, async (args) => ({
                contents: await fs.promises.readFile(args.path, 'utf8'),
                loader: 'text',
            }));
            if (workerMode) {
                // Worker 图内不得出现引擎：解析为空模块，若 worker 真需要运行时 three 符号，
                // esbuild 会以「No matching export」当场构建失败——把不确定性变成构建期断言。
                build.onResolve({ filter: /^three(\/addons\/postprocessing\/Pass\.js)?$/ }, () => ({
                    path: 'air-engine-free-worker-three-stub',
                    namespace: 'air-worker-three-stub',
                }));
                build.onLoad({ filter: /.*/, namespace: 'air-worker-three-stub' }, () => ({
                    contents: 'export {};',
                    loader: 'js',
                }));
                return;
            }
            build.onResolve({ filter: /^three(\/addons\/postprocessing\/Pass\.js)?$/ }, () => ({
                path: ADAPTER_SPECIFIER,
                external: true,
            }));
            // 内联 Worker：照移植件形态把 worker.ts 单独打包成 Blob URL module worker。
            build.onResolve({ filter: /worker\?worker&inline$/ }, () => ({
                path: 'air-spark-inline-worker',
                namespace: 'air-inline-worker',
            }));
            build.onLoad({ filter: /.*/, namespace: 'air-inline-worker' }, async () => {
                const nested = await esbuild.build({
                    entryPoints: [path.join(VENDOR_SPARK, 'worker.ts')],
                    stdin: undefined,
                    bundle: true,
                    format: 'esm',
                    platform: 'browser',
                    target: 'es2020',
                    write: false,
                    minify: false,
                    define: { 'import.meta.env.SPARK_ENABLE_HOOKS': '"1"' },
                    plugins: [sparkPlugin({ workerMode: true })],
                    logLevel: 'warning',
                });
                const source = nested.outputFiles[0].text;
                return {
                    contents: [
                        'const __src = ' + JSON.stringify(source) + ';',
                        'export default class SparkInlineWorker extends Worker {',
                        '  constructor () {',
                        "    const url = URL.createObjectURL(new Blob([__src], { type: 'text/javascript' }));",
                        "    super(url, { type: 'module' });",
                        '    URL.revokeObjectURL(url);',
                        '  }',
                        '}',
                    ].join('\n'),
                    loader: 'js',
                };
            });
        },
    };
}

// ---------- 4. 主流程 ----------
(async () => {
    const checkOnly = process.argv.includes('--check');
    const { source: entrySource, dropped } = buildEntrySource();
    if (!dropped.length) fail('index.ts 中未找到待剔除的 XR/hands 导出，生成器假设已失效');

    fs.mkdirSync(OUT_DIR, { recursive: true });

    const result = await esbuild.build({
        stdin: {
            contents: entrySource,
            resolveDir: VENDOR_SPARK,
            sourcefile: 'air-spark-entry.ts',
            loader: 'ts',
        },
        absWorkingDir: ROOT,
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2020',
        outfile: OUT_JS,
        sourcemap: true,
        metafile: true,
        write: !checkOnly,
        minify: false,
        legalComments: 'none',
        keepNames: true,
        define: { 'import.meta.env.SPARK_ENABLE_HOOKS': '"1"' },
        plugins: [sparkPlugin({ workerMode: false })],
        logLevel: 'warning',
    });

    const inputs = Object.keys(result.metafile.inputs).map(rel).sort();
    const leaked = inputs.filter((p) => /vendor\/spark\/src\/(SparkXr\.ts|hands\.ts)$/.test(p));
    if (leaked.length) fail('XR 子图泄漏进运行时子图：' + leaked.join(', '));
    const threeLeaked = inputs.filter((p) => p.includes('node_modules/three/'));
    if (threeLeaked.length) fail('运行时子图非法包含 three 本体：' + threeLeaked.join(', '));
    const engineLeaked = inputs.filter((p) => p.startsWith('src/cocos/'));
    if (engineLeaked.length) fail('运行时子图不应直接编译引擎源码：' + engineLeaked.join(', '));
    if (!inputs.some((p) => p.endsWith('vendor/spark/src/SparkRenderer.ts'))) fail('SparkRenderer 未进入子图');
    // 计划 §SPK-11 要求保留的能力面（解码 / WASM 排序 / SH / GPU 生成器 / 累积器 / 光栅着色器）。
    const required = [
        ['SplatMesh.ts', (p) => p.endsWith('vendor/spark/src/SplatMesh.ts')],
        ['SplatPager.ts（流式分页）', (p) => p.endsWith('vendor/spark/src/SplatPager.ts')],
        ['spz.ts（SPZ 解码）', (p) => p.endsWith('vendor/spark/src/spz.ts')],
        ['SplatAccumulator.ts（累积器）', (p) => p.endsWith('vendor/spark/src/SplatAccumulator.ts')],
        ['generators（SH/生成器）', (p) => p.includes('vendor/spark/src/generators')],
        ['dyno（GPU 表达式）', (p) => p.includes('vendor/spark/src/dyno')],
        ['splatFragment.glsl（光栅着色器）', (p) => p.endsWith('vendor/spark/src/shaders/splatFragment.glsl')],
        ['splatVertex.glsl（光栅着色器）', (p) => p.endsWith('vendor/spark/src/shaders/splatVertex.glsl')],
        ['spark_rs_bg.wasm（排序 WASM 字节）', (p) => p.endsWith('vendor/spark-rs/spark_rs_bg.wasm')],
        ['spark_rs.js（wasm-bindgen glue）', (p) => p.endsWith('vendor/spark-rs/spark_rs.js')],
        ['fflate（SPZ 解压）', (p) => p.startsWith('build/fflate/')],
    ];
    for (const [label, pred] of required) {
        if (!inputs.some(pred)) fail('计划 §SPK-11 保留项缺失：' + label);
    }
    const dts = buildDts(entrySource);
    const memory = new Map((result.outputFiles || []).map((f) => [path.resolve(f.path), f.contents]));
    const jsBytes = checkOnly ? memory.get(path.resolve(OUT_JS)) : fs.readFileSync(OUT_JS);
    const mapOut = checkOnly ? memory.get(path.resolve(OUT_JS + '.map')) : fs.readFileSync(OUT_JS + '.map');
    if (!jsBytes || !mapOut) fail('esbuild 未产出预期文件');
    // 产物残留的外部 specifier（应仅有指向适配层的那一条）。
    const externalSpecifiers = [
        ...new Set(
            [
                ...Buffer.from(jsBytes)
                    .toString('utf8')
                    .matchAll(/from\s*["']([^"']+)["']/g),
            ].map((m) => m[1]),
        ),
    ].sort();
    const artifact = {
        generator: rel(path.join(__dirname, path.basename(__filename))),
        plan: 'ai/plans/spark-integration.md §SPK-11 / §SPK-10 / §1.3',
        vendorSparkFiles: inputs.filter((p) => p.startsWith('vendor/spark/')).length,
        vendorSparkRs: inputs.filter((p) => p.startsWith('vendor/spark-rs/')).length,
        fflate: inputs.filter((p) => p.startsWith('build/fflate/')).length,
        inputs,
        externals: externalSpecifiers,
        droppedExports: dropped,
        output: { file: rel(OUT_JS), bytes: jsBytes.length, sha256: sha256(jsBytes) },
        sourcemap: { file: rel(OUT_JS + '.map'), bytes: mapOut.length, sha256: sha256(mapOut) },
        declaration: { file: rel(OUT_DTS), bytes: Buffer.byteLength(dts), sha256: sha256(Buffer.from(dts)) },
    };
    if (externalSpecifiers.length !== 1 || externalSpecifiers[0] !== ADAPTER_SPECIFIER) {
        fail('产物应只依赖适配层一条外部 specifier，实测：' + externalSpecifiers.join(', '));
    }

    if (checkOnly) {
        if (!fs.existsSync(OUT_DTS)) fail('缺少 ' + rel(OUT_DTS));
        if (!fs.existsSync(MANIFEST)) fail('缺少 ' + rel(MANIFEST));
        const prev = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
        const dtsDisk = fs.readFileSync(OUT_DTS, 'utf8');
        const diffs = [];
        if (prev.output.sha256 !== artifact.output.sha256)
            diffs.push(
                'spark-runtime.js sha256 ' +
                    prev.output.sha256.slice(0, 12) +
                    ' -> ' +
                    artifact.output.sha256.slice(0, 12),
            );
        if (sha256(Buffer.from(dtsDisk)) !== prev.declaration.sha256) diffs.push('spark-runtime.d.ts sha256 mismatch');
        if (prev.inputs.length !== artifact.inputs.length)
            diffs.push('inputs ' + prev.inputs.length + ' -> ' + artifact.inputs.length);
        for (const d of diffs) console.error('[spark-runtime-tree] DRIFT ' + d);
        console.log(
            JSON.stringify(
                {
                    gate: 'spark-runtime-tree/v1',
                    mode: 'check',
                    passed: diffs.length === 0,
                    drift: diffs,
                    output: artifact.output,
                },
                null,
                2,
            ),
        );
        if (diffs.length) process.exitCode = 1;
        return;
    }

    fs.writeFileSync(OUT_DTS, dts, 'utf8');
    fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
    fs.writeFileSync(MANIFEST, JSON.stringify(artifact, null, 2) + '\n', 'utf8');
    console.log(
        JSON.stringify(
            {
                gate: 'spark-runtime-tree/v1',
                passed: true,
                inputs: inputs.length,
                xrExcluded: true,
                output: artifact.output,
                declaration: artifact.declaration,
                externals: artifact.externals,
                droppedExports: artifact.droppedExports,
                manifest: rel(MANIFEST),
            },
            null,
            2,
        ),
    );
})().catch((err) => {
    console.error('[spark-runtime-tree] ERROR ' + (err && err.message ? err.message : err));
    process.exitCode = 1;
});
