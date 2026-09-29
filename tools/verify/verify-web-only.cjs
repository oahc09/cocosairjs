/**
 * Phase 8 — Web-only Guard（验收 L8 / npm run verify:web-only）。
 *
 * 判据（计划书 §15）：Dependency / Build Reachability，而不是 grep "NATIVE"。
 *
 * 检查项：
 *  1. 重跑依赖分析（临时目录），Air 闭包内不得出现 NATIVE_ONLY / MINIGAME_ONLY /
 *     PLATFORM_OTHER_ONLY 分类文件。
 *  2. 闭包内文件若 import `external:`（native/external wasm），必须在常量折叠白名单内
 *     （V0.1 仅 mesh-codec 的 CULL_MESHOPT 分支）。
 *  3. 物理边界：src/ 中不存在 *.jsb.ts、native/、MiniGame/Native pal 实现；
 *     src/editor 仅为 ccbuild 占位。
 *  4. 闭包完整性：所有 REACHABLE 文件必须物理存在于 src/。
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const ALLOWED_EXTERNAL = new Set([
    // meshopt wasm 分支被 CULL_MESHOPT=true 常量折叠（docs/foundation/03-upstream-web-build-log.md）
    'cocos/3d/misc/mesh-codec.ts',
]);

const failures = [];
const notes = [];

// 1. 重跑分析
const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'cocosair-verify-'));
execFileSync('node', [path.join(ROOT, 'tools', 'analyze', 'dep-graph.cjs')], {
    cwd: ROOT,
    env: { ...process.env, OUT_DIR: tmpOut },
    stdio: ['ignore', 'pipe', 'inherit'],
});
const graph = JSON.parse(fs.readFileSync(path.join(tmpOut, 'web-dependency-graph.json'), 'utf8'));
fs.rmSync(tmpOut, { recursive: true, force: true });

const reachable = graph.nodes.filter((n) => n.type === 'REACHABLE' && !n.virtual);

// 2. 分类检查
const badCategories = ['NATIVE_ONLY', 'MINIGAME_ONLY', 'PLATFORM_OTHER_ONLY'];
for (const node of reachable) {
    if (badCategories.includes(node.category)) {
        failures.push(`REACHABLE 但分类为 ${node.category}: ${node.path}`);
    }
    const externalImports = (node.dependencies || []).filter(() => false);
    void externalImports;
}
// external: 导入检查（基于 spec 级信息重新扫描闭包文件）
for (const node of reachable) {
    const abs = path.join(ROOT, 'src', node.path);
    if (!fs.existsSync(abs)) continue;
    const content = fs.readFileSync(abs, 'utf8');
    const externalRefs = content.match(/['"]external:[^'"]+['"]/g) || [];
    if (externalRefs.length && !ALLOWED_EXTERNAL.has(node.path)) {
        failures.push(`闭包文件 import external: 未在白名单: ${node.path} (${externalRefs[0]})`);
    }
    if (externalRefs.length && ALLOWED_EXTERNAL.has(node.path)) {
        notes.push(`${node.path}: external: 导入被常量折叠（白名单）`);
    }
}

// 3. 物理边界
const srcRoot = path.join(ROOT, 'src');
const jsbFiles = [];
const nativePalFiles = [];
(function walk (dir, rel) {
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const r = rel ? `${rel}/${name}` : name;
        if (fs.statSync(p).isDirectory()) {
            walk(p, r);
        } else {
            if (name.endsWith('.jsb.ts')) jsbFiles.push(r);
            if (/^pal\/(audio|system-info|screen-adapter|input|env)\/(native|minigame|nodejs)\//.test(r)
                || /^pal\/minigame\//.test(r) && name !== 'non-minigame.js'
                || r === 'pal/pacer/pacer-native.js' || r === 'pal/pacer/pacer-minigame.js' || r === 'pal/pacer/pacer-nodejs.js'
                || r === 'pal/wasm/wasm-native.js' || r === 'pal/wasm/wasm-minigame.js' || r === 'pal/wasm/wasm-nodejs.js') {
                nativePalFiles.push(r);
            }
        }
    }
})(srcRoot, '');
if (jsbFiles.length) failures.push(`src/ 存在 jsb 文件: ${jsbFiles.slice(0, 5).join(', ')}${jsbFiles.length > 5 ? ' ...' : ''}`);
if (nativePalFiles.length) failures.push(`src/pal 存在非 Web 平台实现: ${nativePalFiles.slice(0, 5).join(', ')}`);
if (fs.existsSync(path.join(srcRoot, 'native'))) failures.push('src/ 存在 native/ 目录');
const editorEntries = fs.existsSync(path.join(srcRoot, 'editor'))
    ? fs.readdirSync(path.join(srcRoot, 'editor')).filter((f) => f !== 'exports')
    : [];
if (editorEntries.length) failures.push(`src/editor 含 exports 以外内容: ${editorEntries.join(', ')}`);

// 4. 闭包完整性
const missingInSrc = reachable.filter((n) => !fs.existsSync(path.join(srcRoot, n.path)));
if (missingInSrc.length) {
    failures.push(`闭包文件缺失于 src/: ${missingInSrc.slice(0, 5).map((n) => n.path).join(', ')}`);
}

// 报告
console.log('=== verify:web-only ===');
console.log(`baseline: ${graph.meta.baseline}`);
console.log(`features: ${graph.meta.airFeatures.join(', ')}`);
console.log(`reachable: ${reachable.length} files`);
for (const n of notes) console.log(`  [note] ${n}`);
if (failures.length) {
    for (const f of failures) console.error(`  [FAIL] ${f}`);
    console.error(`verify:web-only FAILED (${failures.length} issues)`);
    process.exit(1);
} else {
    console.log('verify:web-only PASSED');
}
