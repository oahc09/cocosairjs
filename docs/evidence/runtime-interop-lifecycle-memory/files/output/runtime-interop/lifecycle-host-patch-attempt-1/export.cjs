/* Export the fixed Android Surface-lifecycle source candidate without changing its host checkout. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../../../../..');
const base = 'b98101acd368107829a7aa4c0481084f2ecefd5e';
const sourceFiles = [
    'android/app/src/main/java/com/mystral/engine/MystralActivity.java',
    'include/mystral/platform/android_surface.h',
    'include/mystral/platform/window.h',
    'include/mystral/webgpu/context.h',
    'src/platform/android_main.cpp',
    'src/platform/window.cpp',
    'src/runtime.cpp',
    'src/webgpu/bindings.cpp',
    'src/webgpu/context.cpp',
];
const added = 'include/mystral/platform/android_surface.h';
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const portable = (file) => path.relative(root, file).replace(/\\/g, '/');
const read = (file) => fs.readFileSync(path.resolve(root, file));
const args = {};
for (const argument of process.argv.slice(2)) {
    const match = /^--(host|out|checkout|build)=(.+)$/.exec(argument);
    assert(match && !Object.hasOwn(args, match[1]), `Unknown or duplicate argument: ${argument}`);
    args[match[1]] = match[2];
}
for (const name of ['out', 'checkout']) assert(args[name], `--${name}=<new-directory> required`);
const host = path.resolve(root, args.host || 'output/runtime-interop/mystral-source');
const out = path.resolve(root, args.out);
const checkout = path.resolve(root, args.checkout);
const build = path.resolve(root, args.build || 'output/runtime-interop/android-lifecycle-x64-build-attempt-2');
for (const folder of [host, out, checkout, build]) {
    assert(folder.startsWith(root + path.sep), 'All candidate paths must stay inside this repository');
}
assert(!fs.existsSync(out) && !fs.existsSync(checkout), 'Export and verification directories must be new');
assert(checkout.startsWith(path.join(root, 'output') + path.sep), 'Verification checkout must stay in output/');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(path.join(out, 'raw'));
const commands = [];
function put(name, bytes) {
    const file = path.join(out, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes, { flag: 'wx' });
    return { file: name, bytes: bytes.length, sha256: sha256(bytes) };
}
function json(name, value) {
    return put(name, Buffer.from(JSON.stringify(value, null, 2) + '\n'));
}
function git(cwd, parameters, accepted = [0]) {
    const result = spawnSync('git', parameters, { cwd, maxBuffer: 32 * 1024 * 1024 });
    const id = String(commands.length + 1).padStart(2, '0');
    const stdout = put(`raw/git-${id}.stdout`, result.stdout || Buffer.alloc(0));
    const stderr = put(`raw/git-${id}.stderr`, result.stderr || Buffer.alloc(0));
    commands.push({ cwd: portable(cwd) || '.', arguments: parameters, exitCode: result.status, stdout, stderr });
    assert(!result.error && accepted.includes(result.status), `Git failed: ${parameters.join(' ')}`);
    return result.stdout;
}

assert.equal(git(host, ['rev-parse', 'HEAD']).toString().trim(), base);
const changed = [
    ...git(host, ['diff', '--name-only', base]).toString().trim().split('\n'),
    ...git(host, ['ls-files', '--others', '--exclude-standard']).toString().trim().split('\n'),
]
    .filter(Boolean)
    .sort();
assert.deepEqual(changed, [...sourceFiles].sort(), 'Unexpected host source scope');
const sourceBefore = new Map(sourceFiles.map((file) => [file, fs.readFileSync(path.join(host, file))]));
const rows = [];
for (const file of sourceFiles) {
    const before = file === added ? null : git(host, ['show', `${base}:${file}`]);
    const after = sourceBefore.get(file);
    if (before) put(`base-source/${file}`, before);
    put(`modified-source/${file}`, after);
    rows.push({
        file,
        added: before === null,
        beforeBytes: before ? before.length : null,
        beforeSha256: before ? sha256(before) : null,
        afterBytes: after.length,
        afterSha256: sha256(after),
    });
}
const trackedPatch = git(host, [
    'diff',
    '--binary',
    '--full-index',
    base,
    '--',
    ...sourceFiles.filter((f) => f !== added),
]);
const newPatch = git(host, ['diff', '--no-index', '--binary', '--full-index', '--', '/dev/null', added], [1]);
const patch = put('mystral-android-lifecycle.patch', Buffer.concat([trackedPatch, newPatch]));
const license = put('LICENSE-MYSTRAL.txt', git(host, ['show', `${base}:LICENSE`]));
put('base-commit.txt', Buffer.from(base + '\n'));

const compiled = [];
let frozenMap;
for (const name of ['source-before.json', 'source-after.json', 'source-verified.json']) {
    const bytes = fs.readFileSync(path.join(build, name));
    const map = JSON.parse(bytes);
    assert.equal(Object.keys(map).length, 116, 'Unexpected compiled source scope');
    if (frozenMap) assert.deepEqual(map, frozenMap, 'Compiled source maps differ');
    else frozenMap = map;
    compiled.push(put(`compiled-source/${name}`, bytes));
}
for (const [file, expected] of Object.entries(frozenMap)) {
    assert.equal(sha256(fs.readFileSync(path.join(host, file))), expected, `Current compiled source differs: ${file}`);
}
for (const row of rows)
    assert.equal(frozenMap[row.file], row.afterSha256, `Patch not bound to compiled source: ${row.file}`);

git(root, ['clone', '--no-checkout', '--no-hardlinks', '--local', '--', portable(host), portable(checkout)]);
git(checkout, ['checkout', '--detach', base]);
const patchFromCheckout = path.relative(checkout, path.join(out, patch.file)).replace(/\\/g, '/');
git(checkout, ['apply', '--check', patchFromCheckout]);
git(checkout, ['apply', patchFromCheckout]);
const applied = [];
for (const [file, expected] of Object.entries(frozenMap)) {
    const actual = sha256(fs.readFileSync(path.join(checkout, file)));
    assert.equal(actual, expected, `Fresh applied source differs: ${file}`);
    applied.push({ file, sha256: actual });
}
const appliedChanges = [
    ...git(checkout, ['diff', '--name-only', base]).toString().trim().split('\n'),
    ...git(checkout, ['ls-files', '--others', '--exclude-standard']).toString().trim().split('\n'),
]
    .filter(Boolean)
    .sort();
assert.deepEqual(appliedChanges, [...sourceFiles].sort(), 'Fresh applied patch changes unexpected paths');

const sdkFile = 'output/runtime-interop/sdk/cocosair.module.js';
const sdkSha256 = sha256(read(sdkFile));
assert.equal(sdkSha256, '417509cb4774f85346158c7c27f580a7afe5ace70c7486e095b4bbb216de518a');
const assetsFile = 'output/runtime-interop/android-assets-attempt-4/assets-manifest.json';
const assets = JSON.parse(read(assetsFile));
const profile = json('build-profile.json', {
    schema: 'mystral-android-surface-lifecycle-profile-v1',
    sourceBase: base,
    androidStl: 'c++_static',
    jsEngine: 'v8',
    gpuBackend: 'dawn',
    v8: { version: '11.6.189.22', libraryKind: 'static', startupMode: 'embedded' },
    sdlVersion: '3.2.30',
    gradleProperties: {
        mystralJsEngine: 'v8',
        mystralGpuBackend: 'dawn',
        mystralAndroidStl: 'c++_static',
        mystralV8LibraryKind: 'static',
        mystralV8StartupData: 'embedded',
        mystralSdlVersion: '3.2.30',
    },
    fixedDependencies: {
        file: '../16k/build-profile.json',
        sha256: sha256(read('tools/verify/runtime-interop-android/host-patches/16k/build-profile.json')),
    },
    sdk: { file: sdkFile, sha256: sdkSha256, buildNumber: 216 },
    stagedAssets: {
        file: assetsFile,
        sha256: sha256(read(assetsFile)),
        stage: 4,
        files: Object.keys(assets.files).length,
    },
    buildSourceBinding: { originalDirectory: portable(build), sourceCount: 116, maps: compiled },
    scope: 'Same-Activity real Surface loss/restoration only. Source/build identity is separate from runtime acceptance.',
});
const readme = put(
    'README.md',
    Buffer.from(
        `# Android 同 Activity Surface 生命周期修复\n\n固定基线：\`${base}\`（\`oahc09/mystralnative\` 的已推送 SDL 3.2.30 / static C++ 候选）。在该基线的新检出中先执行 \`git apply --check <patch>\`，再执行 \`git apply <patch>\`。\n\n\`mystral-android-lifecycle.patch\` 修改九个文件，其中 \`include/mystral/platform/android_surface.h\` 为新增文件；基线不存在该文件，未伪造空的基线副本。\`base-source/\`、\`modified-source/\` 和 \`manifest.json\` 保留修改前后原始字节。\n\n修复从真实 Java Surface 回调取得自持有的 ANativeWindow 引用与 generation。SDL/JavaScript owner 在线程内退役旧 presentation Surface、恢复新 Surface 并重放已有 canvas 配置；instance、adapter、device、queue 和 JavaScript 会话保持。SDL 事件派发到 resize/输入 JavaScript 回调前同样执行准备，缺有效 Surface 时不派发绘制相关 JavaScript；QUIT 仍可处理。UI 线程不执行 Dawn 释放或重建。\n\n构建继续使用完整官方 SDL 3.2.30、V8 11.6.189.22 static/embedded、\`c++_static\`、SDK build216 与 stage4。固定依赖、原始许可和来源回执沿用相邻 \`../16k/\` 档案，由 \`build-profile.json\` 哈希引用；本目录另附 Mystral 原 MIT 许可，不分发依赖或 APK 二进制。\n\n\`compiled-source/\` 保存 x64 新候选的 source-before/after/verified 原始清单。导出已在新的本地 clone 的精确基线上真实执行 apply-check 与 apply，并逐字节核对九个修改文件和完整 116 项编译源码映射。\`export.cjs\` 是本次实际导出 producer，\`raw/\` 保留 Git 命令结果；旧宿主检出、SDK、资产及历史冻结包不变。\n\n这是源码与应用一致性交付，不单独代表生命周期运行验收通过。范围只覆盖同 Activity 的真实 Surface 销毁与恢复，不扩大为 Activity 重建、设备丢失恢复、任意 Android/ABI、性能或无泄漏证明。实际锁屏、后台、Surface 重建、连续运行与资源释放报告需另行绑定，ARM64 构建/运行也独立记录。\n`,
    ),
);
const producer = put('export.cjs', fs.readFileSync(__filename));
for (const file of sourceFiles)
    assert(
        fs.readFileSync(path.join(host, file)).equals(sourceBefore.get(file)),
        `Host changed during export: ${file}`,
    );
const manifest = json('manifest.json', {
    schema: 'mystral-android-surface-lifecycle-patch-v1',
    createdAt: new Date().toISOString(),
    base,
    repository: 'https://github.com/oahc09/mystralnative',
    sourceFileCount: rows.length,
    files: rows,
    patch,
    license,
    buildProfile: profile,
    compiledSource: compiled,
    readme,
    producer,
    verification: 'verification.json',
});
json('commands.json', commands);
json('verification.json', {
    schema: 'mystral-android-lifecycle-patch-apply-verification-v1',
    createdAt: new Date().toISOString(),
    completed: true,
    pass: true,
    base,
    manifest,
    originalHostUnchanged: true,
    freshCheckout: portable(checkout),
    applyCheckExitCode: 0,
    applyExitCode: 0,
    changedFileCount: rows.length,
    compiledSourceFileCount: applied.length,
    appliedFiles: applied,
    scope: 'Source/apply identity only; no additional runtime acceptance.',
});
console.log(
    JSON.stringify({
        pass: true,
        out: portable(out),
        patch,
        manifest,
        files: rows.length,
        compiledFiles: applied.length,
    }),
);
