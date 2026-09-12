/**
 * Phase 4 — 按 docs/extraction-manifest.json 物理抽取源码到 src/。
 * destination = src/<source>（engine root = src/，上游相对路径原样保留）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const manifest = require(path.join(ROOT, 'docs', 'extraction-manifest.json'));

let copied = 0;
const copiedList = [];
for (const entry of manifest.entries) {
    const src = path.join(ROOT, entry.source);
    const dst = path.join(ROOT, entry.destination);
    if (!fs.existsSync(src)) {
        console.error('MISSING SOURCE:', entry.source);
        continue;
    }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
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
