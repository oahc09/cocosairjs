/**
 * SPK-14 bookkeeping: register the Spark integration-layer files in
 * docs/upstream-file-map.json as Air-original rows (upstreamPath:null) and keep
 * meta.modifiedCount equal to the actual number of modified rows.
 *
 *   node tools/build/register-spark-file-map.cjs [--check]
 *
 * Idempotent: rows already present are left untouched; only files that exist on
 * disk are registered, so it can be re-run as SPK-04..09 land.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const MAP = path.join(root, 'docs', 'upstream-file-map.json');
const REASONS = {
    'src/air/spark/spark-math.ts':
        'AIR: three 形状数学垫片，按 @air-element 归属逐成员复用 cc.math 元素供 vendor/spark 使用；不经根导出面可达（SPK-04）',
    'src/air/spark/spark-api-adapter.ts':
        'AIR: vendor/spark 所需的 three API 兼容面（对象/几何/材质/纹理/RT/加载器），按 @air-element 归属复用引擎 cc.*/gfx:* 元素或标注自持理由；构建期作为 `three` specifier 的别名目标，不进根导出面（SPK-05a）',
    'src/air/spark/pmrem.ts':
        'AIR: three PMREMGenerator 移植（IBL 预滤波图集），引擎无对应 PMIP 管线故自持算法体，GPU 对象经 spark-api-adapter 借用；不进根导出面（SPK-06）',
    'src/air/spark/cocos-renderer.ts':
        'AIR: 把 three 形状 WebGLRenderer 桥到本仓 gfx 层的渲染桥；保留惰性 renderer.xr 外壳以短路冻结代码的非 XR 分支（XR 随 SPK-10 移除，移植件 CocosXrManager 未搬运）；不进根导出面（SPK-07）',
    'src/air/spark/cocos-spark-layer.ts':
        'AIR: Spark 泼溅场景层，绑定 cc.Director/app 管线钩子并管理 splat 目标可见性与渲染钩子；不进根导出面（SPK-08）',
    'src/exports/spark.ts':
        'AIR: 可选 feature unit `spark` 的 bundle 入口（ccbuild 声明见 src/cc.config.json），聚合集成层与生成物 `src/air/spark/generated/spark-runtime.js`；不并入 `air` 聚合、不进默认 bundle（SPK-12）',
};

const doc = JSON.parse(fs.readFileSync(MAP, 'utf8'));
const before = doc.mapping.length;
const known = new Set(doc.mapping.map((e) => e.airPath));
const added = [];
for (const [airPath, reason] of Object.entries(REASONS)) {
    if (known.has(airPath) || !fs.existsSync(path.join(root, airPath))) continue;
    doc.mapping.push({ airPath, upstreamPath: null, baseline: 'AIR Spark integration', modified: true, reason });
    added.push(airPath);
}
const modifiedCount = doc.mapping.filter((e) => e.modified === true).length;
const changed = added.length > 0 || doc.meta.modifiedCount !== modifiedCount;
doc.meta.modifiedCount = modifiedCount;

if (process.argv.includes('--check')) {
    console.log(
        JSON.stringify(
            { mode: 'check', rows: before, wouldAdd: added, modifiedCount, declared: doc.meta.modifiedCount },
            null,
            2,
        ),
    );
    process.exit(0);
}
if (changed) {
    const out = JSON.stringify(doc, null, 2) + '\n';
    if (!out.includes('"mapping"') || out.length < 1000) throw new Error('refusing to write a truncated file-map');
    fs.writeFileSync(MAP, out);
}
console.log(
    JSON.stringify({ mode: 'write', rows: before, added, rowCount: doc.mapping.length, modifiedCount }, null, 2),
);
