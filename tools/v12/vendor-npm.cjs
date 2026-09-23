/**
 * V1.2 P1 — 把 npm 依赖 vendoring 成 Air 自包含 ESM 文件（计划书 P1「所有包内容按需复制进 src/，
 * 保持 Air 源码自包含原则」；ccbuild 的 rollup 不把 node_modules 打进 bundle，
 * 直接复制包内 CJS 入口又缺 commonjs 互操作，故用 esbuild 一次性转 ESM）。
 *
 *   node tools/v12/vendor-npm.cjs <@scope/pkg>[:entry] [--out <name>]
 *
 * 产出 src/external/<name>/air-<name>.esm.js，顶部带 provenance 注释；
 * 并把 moduleOverrides 的 isVirtualModule 规则（`@cocos/x` -> 该文件）写进 src/cc.config.json。
 */
const fs = require('fs');
const path = require('path');
const { buildSync } = require('esbuild');

const ROOT = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
if (!argv.length) {
    console.error('usage: node tools/v12/vendor-npm.cjs <pkg>[:entry] [--out <name>]');
    process.exit(2);
}
const spec = argv[0];
const [pkgName, entryOverride] = spec.split(/:(?!\/*)/); // 区分 'pkg' 与 'pkg:./entry.js'
const outName = argv[argv.indexOf('--out') + 1] && argv.includes('--out')
    ? argv[argv.indexOf('--out') + 1]
    : pkgName.split('/').pop();

const pkgJson = require.resolve(`${pkgName}/package.json`, { paths: [ROOT] });
const pkgDir = path.dirname(pkgJson);
const pkg = require(pkgJson);
const entry = entryOverride || pkg.main || 'index.js';
const version = pkg.version;

const outFile = path.join(ROOT, 'src', 'external', outName, `air-${outName}.esm.js`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const relOut = path.relative(ROOT, outFile).replace(/\\/g, '/');

const banner = [
    `PROVENANCE  package : ${pkgName}@${version}`,
    `            entry   : ${entry}`,
    `            command : node tools/v12/vendor-npm.cjs ${spec}${argv.includes('--out') ? ` --out ${outName}` : ''}`,
    '            note    : V1.2 计划书 P1 依赖 vendoring —— 由 esbuild 以 ESM 单文件重打包进 Air bundle；',
    '                      不参与 src/ 的上游逐字节比对（Air 侧生成物，非官方引擎源码）。',
].join('\n');

buildSync({
    entryPoints: [path.join(pkgDir, entry)],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'chrome66',
    legalComments: 'inline',
    banner: { js: `/*\n${banner}\n*/` },
    outfile: outFile,
    logLevel: 'warning',
});

// 回指 cc.config 的虚拟模块规则
const configPath = path.join(ROOT, 'src', 'cc.config.json');
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
let rule = cfg.moduleOverrides.find(
    (r) => r.isVirtualModule && Object.prototype.hasOwnProperty.call(r.overrides, pkgName),
);
if (!rule) {
    rule = { test: 'true', isVirtualModule: true, overrides: {} };
    cfg.moduleOverrides.push(rule);
}
rule.overrides[pkgName] = path.relative(path.join(ROOT, 'src'), outFile).replace(/\\/g, '/');
fs.writeFileSync(configPath, `${JSON.stringify(cfg, null, 4)}\n`);

const size = fs.statSync(outFile).size;
console.log(`[vendor-npm] ${pkgName}@${version} -> ${relOut} (${size} bytes)`);
console.log(`[vendor-npm] moduleOverrides: "${pkgName}" -> "${rule.overrides[pkgName]}"`);
