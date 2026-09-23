/**
 * Phase 4 — 按 docs/extraction-manifest.json 物理抽取源码到 src/。
 * destination = src/<source>（engine root = src/，上游相对路径原样保留）。
 *
 * V1.2 A0：source 解析支持上游仓库。
 *   --upstream <dir>  上游 engine 仓库根（默认 E:/AIProMax/github/cocos4）
 *   解析顺序：Air 仓库根命中优先（保持 V0.1 旧行为）→ 否则取 <upstream>/<source>。
 *   源为目录时递归复制（回归组常以目录为单位登记）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const manifest = require(path.join(ROOT, 'docs', 'extraction-manifest.json'));

function upstreamArg(name, def) {
    const i = process.argv.indexOf(`--${name}`);
    return i > -1 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : def;
}
const UPSTREAM = upstreamArg('upstream', 'E:/AIProMax/github/cocos4');
const NO_OVERWRITE = process.argv.includes('--no-overwrite');
// --only <prefix>[,<prefix>...]：只处理 source 命中前缀的条目。
// V1.2 回归按批次登记新条目时必须用它限定范围——裸跑会以上游原文覆盖
// src/ 下全部 V0.1 条目，抹掉 upstream-file-map.json 已登记的 Air 修改。
const ONLY = (upstreamArg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);

function inScope (source) {
    return ONLY.length === 0 || ONLY.some((prefix) => source === prefix || source.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`));
}

function resolveSource (source) {
    const local = path.join(ROOT, source);
    if (fs.existsSync(local)) return local;
    const up = path.join(UPSTREAM, source);
    if (fs.existsSync(up)) return up;
    return null;
}

let copied = 0;
const copiedList = [];
const skipped = [];
for (const entry of manifest.entries) {
    if (!inScope(entry.source)) continue;
    const src = resolveSource(entry.source);
    const dst = path.join(ROOT, entry.destination);
    if (!src) {
        console.error('MISSING SOURCE:', entry.source);
        continue;
    }
    if (NO_OVERWRITE && fs.existsSync(dst)) {
        skipped.push(entry.destination);
        continue;
    }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (fs.statSync(src).isDirectory()) fs.cpSync(src, dst, { recursive: true });
    else fs.copyFileSync(src, dst);
    copied++;
    copiedList.push(entry.destination);
}

// 额外固定项（manifest 之外的 Air 侧必需文件）
const extras = [
    { from: 'DebugInfos.d.ts', to: 'src/DebugInfos.d.ts' },     // DebugInfos.json 的类型声明
    { from: 'EngineErrorMap.md', to: 'src/EngineErrorMap.md' }, // build:debug-infos 的输入
    { from: '@types/pal', to: 'src/@types/pal' },               // pal 平台类型声明
    { from: '@types/globals.d.ts', to: 'src/@types/globals.d.ts' },
    { from: '@types/webGL.extras.d.ts', to: 'src/@types/webGL.extras.d.ts' },
    { from: '@types/webGL2.extras.d.ts', to: 'src/@types/webGL2.extras.d.ts' },
    { from: '@types/jsb.d.ts', to: 'src/@types/jsb.d.ts' },     // NATIVE 分支内的 jsb 全局符号
];
for (const { from, to } of extras) {
    const s = path.join(ROOT, from);
    const d = path.join(ROOT, to);
    if (!fs.existsSync(s)) {
        console.error('MISSING EXTRA:', from);
        continue;
    }
    if (fs.statSync(s).isDirectory()) {
        fs.cpSync(s, d, { recursive: true });
    } else {
        fs.mkdirSync(path.dirname(d), { recursive: true });
        fs.copyFileSync(s, d);
    }
    copied++;
    copiedList.push(to);
}

console.log(`[extract] copied ${copied} files -> src/`);
if (process.argv.includes('--list')) copiedList.forEach((f) => console.log('  ' + f));
