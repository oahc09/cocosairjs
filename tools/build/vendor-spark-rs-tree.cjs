/* SPK-11：把冻结的 spark-rs wasm-bindgen 运行件逐字节镜像到 vendor/spark-rs/，并生成指纹清单。
 *
 * 照 tools/build/vendor-spark-tree.cjs 的先例：上游/移植件来源只读，本工具只做「字节复制 +
 * SHA-256 比对」，不对任何落位文件做转写、格式化或重排。
 *
 *   node tools/build/vendor-spark-rs-tree.cjs --check                      只读校验（默认）
 *   node tools/build/vendor-spark-rs-tree.cjs --write                      从来源根重建 vendor/spark-rs/
 *   node tools/build/vendor-spark-rs-tree.cjs --manifest <path>            写指纹清单（需显式 .json 路径）
 *   SPARK_RS_UPSTREAM=<path>                                               覆盖来源根
 *
 * 退出码：0 = 全部逐字节一致；1 = 存在漂移/缺失/多余/写入失败。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');
const SOURCE = path.resolve(process.env.SPARK_RS_UPSTREAM || 'E:/AIProMax/github/spark-cocosairjs/vendor/spark-rs');
const DEST = path.join(ROOT, 'vendor', 'spark-rs');

/* 冻结的 wasm-bindgen 运行件集合（SPK-11 §A）。spark_rs.js 为 ES 模块 glue，
 * spark_rs_bg.wasm 为 wasm 二进制本体；两者均按「源等价发行件」逐字节搬运，未在本环境重建。 */
const INCLUDE_FILES = ['spark_rs.js', 'spark_rs_bg.wasm'];

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const hashFile = (abs) => sha256(fs.readFileSync(abs));

/* 落位文件相对路径（POSIX 分隔），排序稳定。 */
function includedFiles () {
    for (const file of INCLUDE_FILES) {
        if (!fs.existsSync(path.join(SOURCE, file))) { throw new Error(`来源根缺失文件：${file}`); }
    }
    return [...INCLUDE_FILES].sort();
}

/* 逐文件清单：路径以 vendor/spark-rs 的相对路径表示，按 path 排序。 */
function buildManifest () {
    const files = includedFiles();
    const rows = files.map((rel) => {
        const destAbs = path.join(DEST, rel);
        const srcAbs = path.join(SOURCE, rel);
        const inSource = fs.existsSync(srcAbs);
        const inDest = fs.existsSync(destAbs);
        const sourceSha = inSource ? hashFile(srcAbs) : null;
        const vendorSha = inDest ? hashFile(destAbs) : null;
        const size = inDest ? fs.statSync(destAbs).size : null;
        const match = sourceSha !== null && vendorSha !== null ? (sourceSha === vendorSha ? 'match' : 'mismatch') : 'missing';
        return { path: rel, size, sha256: vendorSha, sourceSha256: sourceSha, upstreamPath: rel, match };
    });
    const digest = sha256(Buffer.from(rows.map((r) => `${r.sha256}  ${r.path}`).join('\n') + '\n', 'utf8'));
    return {
        schema: 'spark-rs-vendor-tree-v1',
        task: 'SPK-11',
        generatedAt: new Date().toISOString(),
        component: 'spark-rs (wasm-bindgen glue + wasm)',
        sourceOfTruth: SOURCE,
        vendorRoot: 'vendor/spark-rs',
        includes: { files: INCLUDE_FILES },
        treeDigest: {
            sha256: digest,
            method: 'sha256 over the sorted lines "<fileSha256>  <path>" joined by LF with a trailing LF',
        },
        counts: { files: rows.length },
        byteIdentical: rows.length > 0 && rows.every((r) => r.match === 'match'),
        files: rows,
    };
}

/* 只读校验：vendor/spark-rs 每个文件必须与来源根逐字节一致，且没有未登记的多余文件。 */
function check () {
    const failures = [];
    let manifest;
    try {
        manifest = buildManifest();
    } catch (error) {
        return { failures: [`清单构造失败：${error.message}`], manifest: null };
    }
    for (const row of manifest.files) {
        if (row.match === 'missing') { failures.push(`落位缺失：vendor/spark-rs/${row.path}`); } else if (row.match === 'mismatch') {
            failures.push(`逐字节不一致：vendor/spark-rs/${row.path} (${row.sha256}) != 来源 ${row.sourceSha256}`);
        }
    }
    if (fs.existsSync(DEST)) {
        const known = new Set(manifest.files.map((r) => r.path));
        for (const entry of fs.readdirSync(DEST, { withFileTypes: true })) {
            if (!entry.isFile()) { continue; }
            if (!known.has(entry.name)) { failures.push(`未登记的 vendor 文件：vendor/spark-rs/${entry.name}`); }
        }
    } else {
        failures.push('vendor/spark-rs 目录缺失');
    }
    return { failures, manifest };
}

function writeTree (manifest) {
    fs.mkdirSync(DEST, { recursive: true });
    for (const row of manifest.files) {
        fs.copyFileSync(path.join(SOURCE, row.path), path.join(DEST, row.path));
    }
}

function main () {
    const argv = process.argv.slice(2);
    const manifestArgIndex = argv.indexOf('--manifest');
    const manifestArg = manifestArgIndex >= 0 ? argv[manifestArgIndex + 1] : undefined;
    const outPath =
        manifestArg && path.extname(manifestArg) === '.json' ? path.resolve(ROOT, manifestArg) : null;
    if (manifestArgIndex >= 0 && !outPath) {
        console.error(
            '用法：node tools/build/vendor-spark-rs-tree.cjs --manifest output/spark-rs/<name>.json（--manifest 必须跟一个 .json 文件路径）'
        );
        process.exitCode = 1;
        return;
    }
    let { failures, manifest } = check();
    if (argv.includes('--write')) {
        if (!manifest) {
            console.log(JSON.stringify({ ok: false, failures }));
            process.exitCode = 1;
            return;
        }
        writeTree(manifest);
        ({ failures, manifest } = check());
    }
    if (outPath) {
        if (!manifest) {
            console.log(JSON.stringify({ ok: false, failures: failures.concat('无法写清单：来源根不可读') }));
            process.exitCode = 1;
            return;
        }
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    }
    const summary = {
        ok: failures.length === 0,
        byteIdentical: manifest ? manifest.byteIdentical : false,
        files: manifest ? manifest.counts.files : 0,
        treeDigest: manifest ? manifest.treeDigest.sha256 : null,
        sourceOfTruth: SOURCE,
        failures: failures.slice(0, 20),
        failureCount: failures.length,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (failures.length) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main();
}

module.exports = { buildManifest, check, writeTree, DEST, SOURCE, INCLUDE_FILES };
