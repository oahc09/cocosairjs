#!/usr/bin/env node
/**
 * SPK-11 资产门禁：审计 Spark 的两个第三方构建期资产目录
 *   - `vendor/spark-rs/`（排序/解码 WASM + wasm-bindgen glue，上游 dist 发行件，未重建）
 *   - `build/fflate/`（SPZ 解压依赖，`npm pack fflate@0.8.2` 原样落位）
 *
 *   node tools/verify/spark-assets.cjs [--json]
 *
 * 断言（失败列清单、非零退出，不写固定产物）：
 *  1. 清单完整性：目录内每个文件都在 `MANIFEST.md` 表里且 bytes + sha256 逐字节相符；反向亦然（无幽灵行）。
 *  2. 许可原文：`licenses/LICENSE_spark.txt` == `vendor/spark-rs/LICENSE` == `vendor/spark/LICENSE`；
 *     `licenses/LICENSE_fflate.txt` == `build/fflate/LICENSE`（不许手写许可）。
 *  3. 资产目录形态：`build/fflate/package.json` 带 `type` 声明（gltf-decoders 同族口径）。
 *  4. 默认产物隔离：`build/cocosair.module.js{,.map}` 与 `.min.js{,.map}` 内不得出现 WASM magic、
 *     `spark_rs_bg.wasm` / `spark-rs/` / `fflate` 引用或 Spark 符号。
 *  5. 内嵌防漂移：生成运行时 `src/air/spark/generated/spark-runtime.js` 里内联的 base64 载荷解码后，
 *     其 sha256 必须等于清单记录的 `spark_rs_bg.wasm`（§SPK-11 发运形态：构建期内联而非应用托管）。
 *     这条把「内嵌字节」与「冻结资产字节」绑死，替换 wasm 却忘记重新生成子图会立刻红。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const GENERATED = 'src/air/spark/generated/spark-runtime.js';
const ASSET_DIRS = ['vendor/spark-rs', 'build/fflate'];
const LICENSE_PAIRS = [
    ['licenses/LICENSE_spark.txt', ['vendor/spark-rs/LICENSE', 'vendor/spark/LICENSE']],
    ['licenses/LICENSE_fflate.txt', ['build/fflate/LICENSE']],
];
const DEFAULT_BUNDLES = [
    'build/cocosair.module.js',
    'build/cocosair.module.min.js',
    'build/cocosair.module.js.map',
    'build/cocosair.module.min.js.map',
];
const ISOLATION_MARKERS = ['spark_rs_bg.wasm', 'spark-rs/', 'SparkRenderer', 'sparkjsdev', 'fflate', 'SplatMesh'];
const WASM_MAGIC = Buffer.from([0x00, 0x61, 0x73, 0x6d]);

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel));
const abs = (rel) => path.join(ROOT, rel);
const walk = (dir) =>
    fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

/** 与 tools/verify/decoder-audit.cjs 同形的 `| file | bytes | sha256 |` 行解析。 */
function parseManifest(text) {
    const rows = new Map();
    for (const line of text.split(/\r?\n/)) {
        const m = /^\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*([0-9a-f]{64})\s*\|\s*$/.exec(line);
        if (m) rows.set(m[1], { bytes: Number(m[2]), sha: m[3] });
    }
    return rows;
}

function check() {
    const failures = [];
    const artifacts = [];

    for (const relDir of ASSET_DIRS) {
        const dir = abs(relDir);
        const manifestPath = path.join(dir, 'MANIFEST.md');
        if (!fs.existsSync(manifestPath)) {
            failures.push(`${relDir}: 缺 MANIFEST.md`);
            continue;
        }
        const rows = parseManifest(fs.readFileSync(manifestPath, 'utf8'));
        if (!rows.size) failures.push(`${relDir}/MANIFEST.md: 没有可解析的 bytes+sha256 行`);
        const onDisk = walk(dir)
            .map((f) => path.relative(dir, f).split(path.sep).join('/'))
            .filter((k) => k !== 'MANIFEST.md')
            .sort();
        for (const key of onDisk) {
            const entry = rows.get(key);
            const file = path.join(dir, key);
            if (!entry) {
                failures.push(`${relDir}: 文件未登记进 MANIFEST：${key}`);
                continue;
            }
            if (fs.statSync(file).size !== entry.bytes) {
                failures.push(`${key}: size ${fs.statSync(file).size} != manifest ${entry.bytes}`);
                continue;
            }
            const hash = sha256(file);
            if (hash !== entry.sha) failures.push(`${key}: sha256 ${hash} != manifest ${entry.sha}`);
            artifacts.push({ file: `${relDir}/${key}`, bytes: entry.bytes, sha256: hash });
        }
        for (const key of rows.keys()) {
            if (!onDisk.includes(key)) failures.push(`${relDir}/MANIFEST.md: 清单行无对应文件：${key}`);
        }
    }

    for (const [license, sources] of LICENSE_PAIRS) {
        if (!fs.existsSync(abs(license))) {
            failures.push(`缺许可原文：${license}`);
            continue;
        }
        const shipped = read(license);
        for (const src of sources) {
            if (!fs.existsSync(abs(src))) {
                failures.push(`许可来源缺失：${src}`);
                continue;
            }
            if (!read(src).equals(shipped)) failures.push(`${license} 与 ${src} 不逐字节一致`);
        }
    }

    const ffPkg = path.join(ROOT, 'build/fflate/package.json');
    if (!fs.existsSync(ffPkg)) {
        failures.push('缺 build/fflate/package.json（type 声明）');
    } else {
        const type = JSON.parse(fs.readFileSync(ffPkg, 'utf8')).type;
        if (type !== 'module') failures.push(`build/fflate/package.json type=${type}，应为 module`);
    }

    for (const rel of DEFAULT_BUNDLES) {
        if (!fs.existsSync(abs(rel))) {
            failures.push(`默认产物缺失：${rel}（先 npm run build）`);
            continue;
        }
        const buf = read(rel);
        if (buf.includes(WASM_MAGIC)) failures.push(`${rel}: 含 WASM magic 字节`);
        const text = buf.toString('utf8');
        for (const marker of ISOLATION_MARKERS) {
            if (text.includes(marker)) failures.push(`${rel}: 默认产物内嵌 Spark 侧引用 ${marker}`);
        }
        artifacts.push({ file: rel, bytes: buf.length, isolation: 'clean' });
    }

    if (!fs.existsSync(abs(GENERATED))) {
        failures.push(`缺生成运行时：${GENERATED}（先 node tools/build/spark-runtime-tree.cjs）`);
    } else {
        const text = fs.readFileSync(abs(GENERATED), 'utf8');
        const payloads = text.match(/["']([A-Za-z0-9+/=]{200000,})["']/g) || [];
        if (!payloads.length) {
            failures.push(`${GENERATED}: 找不到内嵌的 base64 WASM 载荷（生成形态变了）`);
        } else {
            const decoded = Buffer.from(payloads[0].slice(1, -1), 'base64');
            const wasmRel = 'vendor/spark-rs/spark_rs_bg.wasm';
            const manifest = parseManifest(fs.readFileSync(abs('vendor/spark-rs/MANIFEST.md'), 'utf8'));
            const expected = manifest.get('spark_rs_bg.wasm');
            if (!expected) {
                failures.push('vendor/spark-rs/MANIFEST.md: 缺 spark_rs_bg.wasm 行');
            } else {
                const embeddedSha = crypto.createHash('sha256').update(decoded).digest('hex');
                if (embeddedSha !== expected.sha) {
                    failures.push(
                        `${GENERATED}: 内嵌 wasm 字节 ${embeddedSha} != 冻结资产 ${expected.sha}（资产已换而子图未重生成）`,
                    );
                }
                artifacts.push({
                    file: 'embedded-wasm',
                    bytes: decoded.length,
                    sha256: embeddedSha,
                    matchesAsset: embeddedSha === expected.sha && decoded.length === expected.bytes,
                });
                if (decoded.length !== expected.bytes) {
                    failures.push(`${GENERATED}: 内嵌 wasm ${decoded.length} B != 资产 ${expected.bytes} B`);
                }
                if (fs.existsSync(abs(wasmRel)) && !read(wasmRel).equals(decoded)) {
                    failures.push(`${GENERATED}: 内嵌字节与 ${wasmRel} 内容不一致`);
                }
            }
        }
    }

    return {
        schema: 'spark-assets/1',
        passed: failures.length === 0,
        assetDirs: ASSET_DIRS,
        artifactCount: artifacts.length,
        artifacts,
        failures,
        note: 'SPK-11 只读资产审计；不写固定产物。默认产物隔离 + 内嵌字节防漂移。',
    };
}

const report = check();
if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
} else {
    console.log(
        `[spark-assets] passed=${report.passed} artifacts=${report.artifactCount} failures=${report.failures.length}`,
    );
    report.failures.forEach((f) => console.log('  !', f));
}
process.exitCode = report.passed ? 0 : 1;
