/* SPK-11 Gate: spark-rs 冻结运行件资产审计（机器可读输出，风格对齐 tools/verify/decoder-audit.cjs）。
 *
 * 为什么单独立一个工具而不是扩展 decoder-audit.cjs：
 *   decoder-audit.cjs 的资产全部住在 build/gltf-decoders/，靠解析 build/gltf-decoders/MANIFEST.md
 *   取指纹，并在 npm pack 解包后对 meshopt/draco 走 Node require() 验证离线可加载。spark-rs 住在
 *   vendor/spark-rs/，是「构建期 alias 目标」——ESM glue 由 esbuild 别名消费、默认产物里不出现，
 *   不经 Node require。把 spark 家族塞进 decoder-audit 的 ['meshopt','draco','basis'] 组件循环会
 *   破坏其 MANIFEST.md 行解析与 npm-pack require 前提。故 spark-rs 用本工具单独校验，不改动现有
 *   decoder-audit.cjs（保证 G5-build 门禁零回归）。
 *
 * 校验项（任一失败 exit 1，stdout = JSON 报告）：
 *   1. 资产齐备 —— vendor/spark-rs/{spark_rs.js, spark_rs_bg.wasm} 存在，且目录无多余文件。
 *   2. SHA-256 对账 —— 落位字节逐一等于清单（SPARK_RS_MANIFEST，缺省 output/spark-rs/ 里最新清单）
 *      记录的哈希；并把 spark_rs_bg.wasm 绑回 ai/plans/spark-integration.md §2.1 记录的冻结身份。
 *   3. package.json `type` 处理 —— 本仓根为 "type":"commonjs"，glue 必须是 ESM 形态（export/import
 *      起始）⇒ 只能经构建期 alias 消费、绝不会被 Node require；vendor 副本旁不得出现会改变模块解析
 *      的 companion package.json，也不得被 exports/files 暴露为可 require 入口。
 *   4. 默认 bundle 隔离 —— build/cocosair.module.js(+.min.js) 及其 source map 不内联任何 spark 资产：
 *      无 wasm magic 字节、无 spark_rs / spark_rs_bg.wasm 文件名、无 spark-rs 裸 specifier。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '../..');
const vendorDir = path.join(root, 'vendor', 'spark-rs');
const failures = [];
const artifacts = [];

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const hashFile = (abs) => sha256(fs.readFileSync(abs));

/* 冻结身份（ai/plans/spark-integration.md §2.1 line 74：源等价发行件，未在本环境 Rust 重建）。 */
const EXPECTED_WASM_SHA = '974320be5859f426967a2d9cc237e5eae1aca98b55e35087022d6d884b2dcce7';
const INCLUDE_FILES = ['spark_rs.js', 'spark_rs_bg.wasm'];

/* --- 清单定位（committed 指纹来源；可用 SPARK_RS_MANIFEST 覆盖）--------------------------- */
function locateManifest () {
    if (process.env.SPARK_RS_MANIFEST) { return path.resolve(root, process.env.SPARK_RS_MANIFEST); }
    const dir = path.join(root, 'output', 'spark-rs');
    if (!fs.existsSync(dir)) { return null; }
    const cands = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
    return cands.length ? path.join(dir, cands[cands.length - 1]) : null;
}

/* --- 1 & 2: 资产齐备 + SHA-256 对账 ------------------------------------------------------- */
if (!fs.existsSync(vendorDir)) {
    failures.push(`vendor/spark-rs 目录缺失：${path.relative(root, vendorDir)}`);
} else {
    const onDisk = fs.readdirSync(vendorDir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
    for (const name of INCLUDE_FILES) {
        const abs = path.join(vendorDir, name);
        if (!fs.existsSync(abs)) { failures.push(`资产缺失：vendor/spark-rs/${name}`); continue; }
        const bytes = fs.readFileSync(abs);
        const h = sha256(bytes);
        artifacts.push({ file: `vendor/spark-rs/${name}`, bytes: bytes.length, sha256: h });
        if (name === 'spark_rs_bg.wasm' && h !== EXPECTED_WASM_SHA) {
            failures.push(`spark_rs_bg.wasm sha256 ${h} != 计划冻结身份 ${EXPECTED_WASM_SHA}`);
        }
    }
    for (const name of onDisk) {
        if (!INCLUDE_FILES.includes(name)) { failures.push(`未登记的 vendor 文件：vendor/spark-rs/${name}`); }
    }
}

const manifestPath = locateManifest();
let manifestRowMap = null;
if (!manifestPath) {
    failures.push('无法定位清单（output/spark-rs/*.json 缺失；先跑 --manifest 或设 SPARK_RS_MANIFEST）');
} else {
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        manifestRowMap = new Map((manifest.files || []).map((r) => [r.path, r]));
        for (const [rel, row] of manifestRowMap) {
            const abs = path.join(vendorDir, rel);
            if (!fs.existsSync(abs)) { failures.push(`清单行无落位文件：vendor/spark-rs/${rel}`); continue; }
            const st = fs.statSync(abs);
            if (row.size != null && st.size !== row.size) { failures.push(`${rel}: size ${st.size} != 清单 ${row.size}`); }
            const h = hashFile(abs);
            if (row.sha256 && h !== row.sha256) { failures.push(`vendor/spark-rs/${rel}: sha256 ${h} != 清单 ${row.sha256}`); }
        }
        artifacts.push({ file: path.relative(root, manifestPath).split(path.sep).join('/'), role: 'manifest' });
    } catch (err) {
        failures.push(`清单不可解析 ${manifestPath}: ${err.message}`);
    }
}

/* --- 3: package.json type 声明处理 -------------------------------------------------------- */
let rootType = null;
try { rootType = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).type ?? null; } catch (err) {
    failures.push(`package.json 不可读：${err.message}`);
}
const companionPkgJson = path.join(vendorDir, 'package.json');
if (fs.existsSync(companionPkgJson)) { failures.push('vendor/spark-rs 旁出现 companion package.json（破坏逐字节镜像 + 会改变模块解析）'); }

const glueAbs = path.join(vendorDir, 'spark_rs.js');
if (fs.existsSync(glueAbs)) {
    const glue = fs.readFileSync(glueAbs, 'utf8');
    const isEsm = /^\s*(export|import)\b/m.test(glue);
    const hasCjsModule = /\bmodule\.exports\s*=|\brequire\(/.test(glue);
    if (!isEsm) { failures.push('spark_rs.js 非 ESM 形态：与「构建期 alias 消费」前提不符'); }
    if (hasCjsModule) { failures.push('spark_rs.js 含 CJS module.exports/require：可能被 Node 直接 require，违反 commonjs 根隔离'); }
    /* commonjs 根 ⇒ 该 .js 若被 require 会按 CJS 解析而失败，只能被 esbuild alias 消费。 */
    artifacts.push({
        role: 'type-handling',
        rootPackageType: rootType,
        glueIsEsmOnly: isEsm && !hasCjsModule,
        note: rootType === 'commonjs'
            ? '根为 commonjs：ESM-only glue 不会经 Node require 加载；仅由 tools/build.mjs 的 spark-rs alias 在构建期消费'
            : `根 type=${rootType}：非 commonjs，请复核 alias 消费路径`,
    });
}
/* 不得把 spark-rs 暴露为包入口可 require 路径。 */
try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const exposed = JSON.stringify({ exports: pkg.exports, files: pkg.files, main: pkg.main, module: pkg.module });
    if (/vendor\/spark-rs|spark_rs_bg\.wasm|spark-rs/.test(exposed)) {
        failures.push('package.json 的 exports/files/main/module 暴露了 spark-rs 资产（不应作为发布可 require 入口）');
    }
} catch { /* 读取失败已在上记 */ }

/* --- 4: 默认 bundle 隔离 ------------------------------------------------------------------ */
const bundleFiles = ['build/cocosair.module.js', 'build/cocosair.module.min.js',
    'build/cocosair.module.js.map', 'build/cocosair.module.min.js.map'];
const wasi = Buffer.from([0x00, 0x61, 0x73, 0x6d]);
const sparkMarkers = ['spark_rs_bg.wasm', 'spark_rs.js', 'spark-rs', 'from "spark-rs"'];
for (const relPath of bundleFiles) {
    const abs = path.join(root, relPath);
    if (!fs.existsSync(abs)) { failures.push(`bundle artifact missing: ${relPath}`); continue; }
    const buf = fs.readFileSync(abs);
    if (buf.includes(wasi)) { failures.push(`${relPath}: 含 wasm magic 字节（spark 资产被内联进默认 bundle）`); }
    if (!relPath.endsWith('.map')) {
        const text = buf.toString('utf8');
        for (const marker of sparkMarkers) {
            if (text.includes(marker)) { failures.push(`${relPath}: 内联 spark 引用 ${marker}`); }
        }
    }
    artifacts.push({ file: relPath, bytes: buf.length, role: 'bundle-isolation' });
}

const report = { ok: failures.length === 0, failures, artifacts, manifest: manifestPath ? path.relative(root, manifestPath).split(path.sep).join('/') : null };
console.log(JSON.stringify(report, null, 2));
process.exit(failures.length ? 1 : 0);
