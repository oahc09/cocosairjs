/**
 * 将 npm 依赖的运行时子集按真实包布局复制到 src/node_modules/。
 *
 * 为什么不是 src/external/*.esm.js + cc.config moduleOverrides：
 *   ccbuild 的 module-overrides 插件把虚拟模块实现为
 *   `export * from '<target>'`（@cocos/ccbuild .../engine-js/index.js:235）。
 *   ESM 的 `export *` 按规范不转发 `default`，而官方物理后端代码写的是
 *   `import b2 from '@cocos/box2d'` / `import CANNON from '@cocos/cannon'`
 *   （默认导入），所以该机制对默认导出永远不成立。
 *   官方仓库能工作是因为它的引擎根就是仓库根，nodeResolve 直接在
 *   <root>/node_modules 里解析真实包，再由 rollup-plugin-commonjs
 *   （include: /node_modules/）完成 CJS→ESM 互操作并合成 default。
 *   Air 的引擎根是 src/，ccbuild 的 nodeResolve jail=realpath(src)，
 *   故等价做法是把包放进 src/node_modules/——同样是「包内容按需复制进 src/」，
 *   且复制的是发布包原始字节（不做 esbuild 改写），provenance 最强。
 *
 * 类型侧：包内只放运行期所需文件，package.json 的 types 字段回指
 *   已安装的 node_modules 声明（box2d 的 index.d.ts 依赖其 33 MB 的 src/ 源，
 *   不进仓库）。因此依赖仍需按 P1 声明在 package.json 中供 typecheck 使用。
 *
 * 用法: node tools/build/vendor-package-subset.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PKGS = path.join(ROOT, 'node_modules');
const VENDOR = path.join(ROOT, 'src', 'node_modules');

/** 相对包根的文件清单 + 类型声明回指（相对各 vendor 包目录，即 4 层上跳 = 仓库根）。 */
const SPEC = [
    {
        name: '@cocos/box2d',
        main: './index.js',
        files: ['index.js', 'build/box2d/box2d.umd.js', 'LICENSE'],
        types: '../../../../node_modules/@cocos/box2d/index.d.ts',
    },
    {
        name: '@cocos/cannon',
        main: './build/cannon.js',
        files: ['build/cannon.js', 'LICENSE'],
        types: '../../../../node_modules/@cocos/cannon/CANNON.d.ts',
    },
    {
        name: '@cocos/dragonbones-js',
        main: './out/dragonBones.js',
        // 上游 package.json 标了 "type": "module"，逐字段保持一致
        type: 'module',
        files: ['out/dragonBones.js', 'README.md'],
        types: '../../../../node_modules/@cocos/dragonbones-js/out/dragonBones.d.ts',
    },
];

function sha256 (buf) {
    return require('crypto').createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

const report = [];
for (const spec of SPEC) {
    const srcDir = path.join(PKGS, spec.name);
    if (!fs.existsSync(srcDir)) {
        throw new Error(`Missing installed package: ${spec.name} (run npm ci first)`);
    }
    const installed = JSON.parse(fs.readFileSync(path.join(srcDir, 'package.json'), 'utf8'));
    const destDir = path.join(VENDOR, spec.name);
    const manifest = { name: spec.name, version: installed.version };
    if (spec.type) { manifest.type = spec.type; }
    manifest.main = spec.main;
    if (spec.types) { manifest.types = spec.types; }
    manifest._airProvenance = `Verbatim subset of npm ${spec.name}@${installed.version}; see UPSTREAM.md V1.2 P1`;
    for (const rel of spec.files) {
        const from = path.join(srcDir, rel);
        const to = path.join(destDir, rel);
        const buf = fs.readFileSync(from);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.writeFileSync(to, buf);
        report.push(`${spec.name}/${rel} ${buf.length}B sha256:${sha256(buf)}`);
    }
    fs.writeFileSync(path.join(destDir, 'package.json'), JSON.stringify(manifest, null, 4) + '\n');
    report.push(`${spec.name}/package.json (air-authored, version pinned to ${installed.version})`);
}

console.log('[vendor-pkg] engine-root packages:');
for (const line of report) { console.log('  ' + line); }
console.log(`[vendor-pkg] ${report.length} files under src/node_modules/`);

// --- 偏差登记（计划书 P1：每个非上游原文的文件都要有理由） -----------------------
// 运行库文件 = 官方发布包原始字节（modified:false）；
// package.json = Air 侧撰写（modified:true），因为官方 package.json 会把
// module/main 指向发布包的全量布局，而这里只放运行期子集 + types 回指。
// 幂等：已登记过的 airPath 不重复追加。
{
    const mapPath = path.join(ROOT, 'docs', 'upstream-file-map.json');
    const raw = fs.readFileSync(mapPath, 'utf8');
    const map = JSON.parse(raw);
    const have = new Set(map.mapping.map((e) => e.airPath));
    const rows = [];
    for (const spec of SPEC) {
        const installed = JSON.parse(fs.readFileSync(path.join(PKGS, spec.name, 'package.json'), 'utf8'));
        const baseline = `npm ${spec.name}@${installed.version}（上游 package.json pin）`;
        for (const rel of spec.files) {
            if (have.has(`src/node_modules/${spec.name}/${rel}`)) { continue; }
            rows.push({
                airPath: `src/node_modules/${spec.name}/${rel}`,
                upstreamPath: `${spec.name}@${installed.version}/${rel}`,
                baseline,
                modified: false,
                reason: `V1.2 P1 运行库 vendored：官方发布包原始字节逐字复制（不做 esbuild 改写），smoke-30 以 sha256 断言与 node_modules 一致`,
            });
        }
        const pkgJsonPath = `src/node_modules/${spec.name}/package.json`;
        if (!have.has(pkgJsonPath)) {
            rows.push({
                airPath: pkgJsonPath,
                upstreamPath: `${spec.name}@${installed.version}/package.json`,
                baseline,
                modified: true,
                reason: `V1.2 P1 Air 侧撰写（非上游原文）：ccbuild 的 moduleOverrides 用 \`export * from\` 实现虚拟模块，按 ESM 规范不转发 default，而官方物理/骨骼代码写的是默认导入；nodeResolve 的 jail=realpath(src) 又使仓库根 node_modules 不可达。故把包按真实布局复制进 src/node_modules/，本 manifest 只声明 main/type，并把 types 回指已安装包（${spec.types ? spec.types : '无'}）以复用官方声明，避免把发布包全量源码（box2d 约 92 MB）纳入仓库。`,
            });
        }
    }
    if (rows.length) {
        const text = rows.map((r) => '    {\n      "airPath": ' + JSON.stringify(r.airPath)
            + ',\n      "upstreamPath": ' + JSON.stringify(r.upstreamPath)
            + ',\n      "baseline": ' + JSON.stringify(r.baseline)
            + `,\n      "modified": ${r.modified},\n      "reason": ` + JSON.stringify(r.reason)
            + '\n    }').join(',\n');
        // 文本插入（与 regress.cjs 同风格，不整文件重排），并回填 modifiedCount
        const modifiedCount = JSON.parse(raw).mapping.filter((e) => e.modified).length + rows.filter((r) => r.modified).length;
        const bumped = raw.replace(/("modifiedCount":\s*)\d+/, `$1${modifiedCount}`);
        const i = bumped.lastIndexOf('\n  ]');
        const next = bumped.slice(0, i) + ',\n' + text + bumped.slice(i);
        JSON.parse(next); // 语法自校验，坏登记不落盘
        fs.writeFileSync(mapPath, next);
        console.log(`[vendor-pkg] upstream-file-map += ${rows.length} (modifiedCount=${modifiedCount})`);
    } else {
        console.log('[vendor-pkg] upstream-file-map 已登记，无需追加');
    }
}
