/* SPK-02 — Spark 移植件资产清单与依赖图分类采集器。
 *
 * 只读扫描移植件树（默认 E:/AIProMax/github/spark-cocosairjs），对每个文件计算
 * {path,size,sha256}，按下方显式分类表打上 `category` 与中文 `reason`，
 * 并写出 `docs/evidence/spark/asset-inventory-20261011.json`。
 *
 * 分类表是「先命中先返回」的有序规则；类别字符串固定为计划 §SPK-02 约定的八个：
 *   AIR集成层 / 冻结上游 / 兼容垫片 / XR家族 / 测试工具 / 构建产物 / 许可与清单 / 其他
 *
 * 独立复算：本脚本自行逐文件重算 SHA-256，不依赖任何既有清单；
 * 若同目录存在 SPK-00 的 identity-20261011.json，则对其记录的移植件
 * src/dist/vendor 文件做只读交叉核对（census 字段），两者不一致会显式登记 mismatch，
 * 但绝不据其改写本次实测值（identity 只作旁证，非权威来源）。
 *
 * 复算命令（唯一入口，退出码 0=正常写出）：
 *   node tools/verify/spark-inventory.cjs
 * 可选环境变量 PORT_ROOT 覆盖移植件根目录。 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------- 配置常量
const PORT_ROOT = process.env.PORT_ROOT
    ? path.resolve(process.env.PORT_ROOT)
    : 'E:/AIProMax/github/spark-cocosairjs';
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_PATH = path.join(REPO_ROOT, 'docs', 'evidence', 'spark', 'asset-inventory-20261011.json');
const IDENTITY_PATH = path.join(REPO_ROOT, 'docs', 'evidence', 'spark', 'identity-20261011.json');
const SKIP_DIRS = new Set(['node_modules', '.git']);

// ---------------------------------------------------------------- 分类表
// reason 中的落位/搬运结论与计划 §1.1/§1.3 及 SPK-03/04/05/06/07/08/09/10/11/13/14 对齐。
const REASON = {
    'AIR集成层': 'AIR 在原生 gfx 之上写的渲染集成层，TS 化落 `src/air/spark/`（见 SPK-07/08/09）',
    '冻结上游': '冻结的 Spark 上游算法本体/等价发行件；SPK-03 逐字节落 `vendor/spark/`，WASM 按 decoder 模式独立发运（SPK-11）',
    '兼容垫片': '跨引擎形状/命名/存储适配层，复用引擎元素不重写算法；TS 化落 `src/air/spark/`（见 SPK-04/05a/06）',
    'XR家族': '随 SPK-10 排除，不搬运；不进运行时子图与公开导出面（相对上游公开面的真实收窄）',
    '测试工具': '移植件私有 test/tool/artifacts，不搬运；本仓 SPK-13 以等价复跑重建夹具',
    '构建产物': '预构建/参考 bundle，不搬运（补丁层作废，目标改为源码）；仅作身份参考',
    '许可与清单': '许可与清单材料，经 SPK-03/SPK-14 转录至 `licenses/`、`docs/THIRD_PARTY_LICENSES.md` 与 `vendor/spark/`',
    '其他': '仅独立参考页/文档用途（依赖 Three 或纯叙述），不搬运',
};

// 逐文件精确覆盖计划默认表的特殊情况；其余走目录规则。
const EXPLICIT = new Map([
    ['src/CocosXrManager.js', 'XR家族'],
    ['src/CocosRenderer.js', 'AIR集成层'],
    ['src/CocosSparkLayer.js', 'AIR集成层'],
    ['src/cocos-gfx-probe.js', 'AIR集成层'],
    ['src/air-math.js', '兼容垫片'],
    ['src/air-compat.js', '兼容垫片'],
    ['src/air-pmrem.js', '兼容垫片'],
    ['index.js', '兼容垫片'],
    ['upstream/spark/src/SparkXr.ts', 'XR家族'],
    ['upstream/spark/src/hands.ts', 'XR家族'],
]);

// 有序目录规则（先命中先返回），rel 为 posix 相对路径。
function ruleCategory (rel) {
    if (EXPLICIT.has(rel)) return EXPLICIT.get(rel);
    if (rel.startsWith('upstream/spark/')) return '冻结上游';
    if (rel.startsWith('vendor/spark-rs/')) return '冻结上游';
    if (rel.startsWith('vendor/cocos/')) return '构建产物';
    if (rel.startsWith('vendor/') && rel.endsWith('-LICENSE')) return '许可与清单';
    if (rel === 'dist/three-reference.js' || rel === 'dist/three.core.js'
        || rel.startsWith('dist/reference-addons/')) return '其他';
    if (rel.startsWith('dist/')) return '构建产物';
    if (rel.startsWith('tests/') || rel.startsWith('tools/') || rel.startsWith('artifacts/')) return '测试工具';
    if (rel.startsWith('docs/licenses/')) return '许可与清单';
    if (/^(LICENSE|THIRD-PARTY-NOTICES\.md|provenance\.json|EVIDENCE-MANIFEST\.json|SOURCE-MANIFEST\.json|package\.json|package-lock\.json)$/.test(rel)) return '许可与清单';
    return '其他';
}

// 逐文件搬运/落位决策，覆盖 reason 中的通用类别结论。
const FILE_NOTE = {
    'index.js': '移植件根 barrel 聚合出口；仅作 re-export 形状参考，不整体搬运',
    'src/air-math.js': '数学形状适配 → `src/air/spark/spark-math.ts`（SPK-04）',
    'src/air-compat.js': '兼容门面 → `src/air/spark/spark-api-adapter.ts`（SPK-05a）',
    'src/air-pmrem.js': 'PMREM → `src/air/spark/pmrem.ts`（SPK-06）',
    'src/CocosRenderer.js': '渲染门面 → `src/air/spark/cocos-renderer.ts`，含惰性 XR 外壳（SPK-07/10）',
    'src/CocosSparkLayer.js': '场景接入 → `src/air/spark/cocos-spark-layer.ts`（SPK-08）',
    'src/cocos-gfx-probe.js': 'gfx 探针 → `tools/debug/probes/` 或 `src/air/spark/`（SPK-09 定位）',
    'src/CocosXrManager.js': 'AIR 自有 XR 管理器，随 SPK-10 删除；运行时保留惰性 xr 外壳',
    'upstream/spark/src/SparkXr.ts': '冻结上游 XR 子图，随 SPK-10 排除，不进 vendor 运行时子图与公开导出',
    'upstream/spark/src/hands.ts': '冻结上游 XR hands 子图，随 SPK-10 排除，不进运行时与公开导出',
    'dist/three-reference.js': '仅独立参考页用（Three 0.180.0），不搬运',
    'dist/three.core.js': '仅独立参考页用（Three 0.180.0 core），不搬运',
    'dist/spark-cocosairjs.js': '移植件目标 bundle（2 738 871 B）；参考身份，目标改为源码不搬运',
    'dist/spark-reference.js': '参考页 bundle；不搬运',
};

function classify (rel) {
    const category = ruleCategory(rel);
    const reason = FILE_NOTE[rel] ? `${REASON[category]}；${FILE_NOTE[rel]}` : REASON[category];
    return { category, reason };
}

// ---------------------------------------------------------------- 遍历
const sha256 = (abs) => crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
function walk (dir, prefix) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const abs = path.join(dir, entry.name);
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) out.push(...walk(abs, rel));
        else out.push(rel);
    }
    return out;
}

// ---------------------------------------------------------------- 交叉核对（只读旁证）
function identityIndex () {
    const idx = new Map();
    if (!fs.existsSync(IDENTITY_PATH)) return { idx, available: false };
    try {
        const id = JSON.parse(fs.readFileSync(IDENTITY_PATH, 'utf8'));
        const pp = id.portPackage || {};
        const groups = [['src', pp.srcFiles], ['dist', pp.distFiles], ['vendor', pp.vendorFiles]];
        for (const [dir, arr] of groups) {
            for (const f of (arr || [])) idx.set(`${dir}/${f.path}`, { size: f.size, sha256: f.sha256 });
        }
        return { idx, available: true };
    } catch (e) {
        return { idx, available: false, error: e.message };
    }
}

// ---------------------------------------------------------------- 主流程
if (!fs.existsSync(PORT_ROOT)) {
    console.error(`[spark-inventory] 移植件根目录不存在: ${PORT_ROOT}`);
    process.exit(2);
}

const allRel = walk(PORT_ROOT, '');
const { idx: idIdx, available: idAvailable, error: idError } = identityIndex();
const mismatches = [];
let crossChecked = 0;

const files = [];
for (const rel of allRel.sort()) {
    const abs = path.join(PORT_ROOT, rel);
    const size = fs.statSync(abs).size;
    const hash = sha256(abs);
    const { category, reason } = classify(rel);
    files.push({ path: rel, size, sha256: hash, category, reason });

    const id = idIdx.get(rel);
    if (id) {
        crossChecked++;
        if (id.sha256 !== hash || id.size !== size) {
            mismatches.push({ path: rel, identity: id, recomputed: { size, sha256: hash } });
        }
    }
}

// 每类别计数 + 总字节
const byCategory = {};
for (const f of files) {
    if (!byCategory[f.category]) byCategory[f.category] = { count: 0, totalBytes: 0 };
    byCategory[f.category].count++;
    byCategory[f.category].totalBytes += f.size;
}
const grandBytes = files.reduce((s, f) => s + f.size, 0);

// 每类别搬运/落位结论（destination decision）
const DECISION = {
    'AIR集成层': '进本仓：TS 化落 `src/air/spark/`（cocos-renderer.ts / cocos-spark-layer.ts；gfx 探针按 SPK-09 定位）',
    '兼容垫片': '进本仓：TS 化复用 cc.math/cc.geometry 落 `src/air/spark/`（spark-math.ts / spark-api-adapter.ts / pmrem.ts）；根 barrel 仅作形状参考不搬运',
    '冻结上游': '进本仓：SPK-03 逐字节落 `vendor/spark/`（src/rust/LICENSE）；WASM 源等价发行件按 decoder 模式独立发运（SPK-11，未用 Rust 重建）',
    'XR家族': '排除：随 SPK-10 移除，不搬运；相对上游公开面收窄，SPK-14 登记 deviation',
    '测试工具': '排除：移植件私有 test/tool/artifacts，不搬运；本仓 SPK-13 以等价复跑重建夹具',
    '构建产物': '排除：预构建/参考/SDK 基线 bundle，不搬运（补丁层作废，目标改为源码）；仅作身份参考',
    '许可与清单': '转录：经 SPK-03/SPK-14 落 `licenses/`、`docs/THIRD_PARTY_LICENSES.md`、`vendor/spark/`；由 verify-licenses 覆盖',
    '其他': '排除：仅独立参考页（依赖 Three）或纯文档，不搬运',
};

const output = {
    schema: 'spark-integration-asset-inventory/v1',
    task: 'SPK-02',
    generatedAt: new Date().toISOString(),
    portRoot: PORT_ROOT,
    notes: [
        '只读扫描 + 逐文件独立重算 SHA-256；不搬运、不改写移植件。',
        '类别字符串固定为计划 §SPK-02 约定的八个；分类为先命中先返回的有序规则表。',
        '交叉核对仅为旁证，identity 采集器（SPK-00）不作权威来源，本次实测值优先。',
    ],
    classification: {
        scope: 'AIR集成层 / 冻结上游 / 兼容垫片 / XR家族 / 测试工具 / 构建产物 / 许可与清单 / 其他',
        rules: {
            explicit: Object.fromEntries(EXPLICIT),
            orderedDirectories: [
                'upstream/spark/** → 冻结上游（SparkXr.ts/hands.ts 例外见 explicit）',
                'vendor/spark-rs/** → 冻结上游（wasm 源等价发行件，未重建）',
                'vendor/cocos/** → 构建产物（SDK 基线副本，补丁层作废）',
                'vendor/*-LICENSE → 许可与清单',
                'dist/three-reference.js / dist/three.core.js / dist/reference-addons/** → 其他（仅独立参考页用，不搬运）',
                'dist/** → 构建产物',
                'tests/** , tools/** , artifacts/** → 测试工具',
                'docs/licenses/** → 许可与清单',
                'root: LICENSE/THIRD-PARTY-NOTICES.md/provenance.json/manifests/package*.json → 许可与清单',
                '其余 → 其他（独立参考页/文档）',
            ],
        },
    },
    summary: {
        fileCount: files.length,
        totalBytes: grandBytes,
        byCategory: Object.fromEntries(
            Object.entries(byCategory).map(([k, v]) => [k, { count: v.count, totalBytes: v.totalBytes, destination: DECISION[k] }]),
        ),
    },
    crossCheck: {
        identityFile: IDENTITY_PATH,
        identityAvailable: idAvailable,
        identityError: idError || null,
        matchedAgainst: crossChecked,
        mismatches,
    },
    reproducible: {
        command: 'node tools/verify/spark-inventory.cjs',
        envOverride: 'PORT_ROOT=<移植件根目录> node tools/verify/spark-inventory.cjs',
        outputFile: 'docs/evidence/spark/asset-inventory-20261011.json',
        exitCode: 0,
        note: '输出按 path 升序、SHA-256 逐文件重算；除 generatedAt 外可复算。',
    },
    files,
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));

console.log('=== SPK-02 Spark 资产清单 ===');
console.log('port root:', PORT_ROOT);
console.log('files:', files.length, '| total bytes:', grandBytes);
for (const [k, v] of Object.entries(byCategory)) console.log(`  ${k}: ${v.count} 文件 / ${v.totalBytes} B`);
console.log('identity cross-check:', idAvailable ? `available, matched=${crossChecked}, mismatch=${mismatches.length}` : 'unavailable');
console.log('written:', path.relative(REPO_ROOT, OUT_PATH).split(path.sep).join('/'));
if (mismatches.length) console.warn('WARNING: 与 identity 清单存在 SHA/size mismatch，详见 JSON crossCheck.mismatches');
process.exit(0);
