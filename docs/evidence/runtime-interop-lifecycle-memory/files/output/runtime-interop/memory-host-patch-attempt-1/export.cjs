/* Export the fixed Android memory/resource and Surface-lifecycle source candidate without changing its host checkout. */
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
    'src/js/v8_engine.cpp',
    'src/platform/android_main.cpp',
    'src/platform/window.cpp',
    'src/raytracing/bindings.cpp',
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
const build = path.resolve(root, args.build || 'output/runtime-interop/android-memory-x64-build-attempt-7');
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
const patch = put('mystral-android-memory.patch', Buffer.concat([trackedPatch, newPatch]));
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
    schema: 'mystral-android-memory-resource-profile-v1',
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
    ownership: {
        counterSchema: 'mystral-webgpu-resource-snapshot-v1',
        managedApiReferenceTypes: 18,
        counterScope:
            'JS WebGPU API result references managed by the bindings ledger; borrowed Context/device/adapter/queue references and internal temporary helpers are excluded.',
        wrapperScope:
            'Actual JS wrapper weak-finalizer callbacks; native API release does not imply wrapper or CPU metadata finalization.',
        canvas: 'One current JS texture per lease; expire/destroy invalidates private tokens and releases owned API refs without destroying Surface-owned backing.',
        androidTransientAcquire:
            'Only Timeout/Outdated/Lost with a live device/configuration may render a discard-only temporary texture; Error, device loss and OOM do not qualify.',
        androidPauseHold:
            'At most one Context-owned old presentation Surface and one explicit ANativeWindow reference, retired on new readiness or normal teardown.',
    },
    scope: 'Source/build identity of memory ownership and same-Activity Surface recovery only; runtime and release acceptance remain separate.',
});
const readme = put(
    'README.md',
    Buffer.from(
        '# Android 资源引用与 Surface 生命周期累计修复\n\n固定基线为 `b98101acd368107829a7aa4c0481084f2ecefd5e`（`oahc09/mystralnative` 已推送的 SDL 3.2.30 / static C++ 候选）。本包不是直接针对原始上游基线。新检出先执行 `git apply --check <patch>`，再执行 `git apply <patch>`。\n\n`mystral-android-memory.patch` 包含 11 个路径：10 份已有文件修改和新增 `include/mystral/platform/android_surface.h`。`base-source/`、`modified-source/` 与 `manifest.json` 保留原始字节；新增头文件在基线不存在，其 before 字段为 null，不伪造空基线副本。旧 lifecycle、static-only、16 KB 补丁及所有失败记录保持。\n\nCanvas lease 在到期前返回同一个 JavaScript texture 对象。它只拥有 `GetCurrentTexture` 返回的 API 引用；实际 backing 归 Surface。自动到期及显式 canvas destroy 不销毁共享 backing；旧 texture/view 的私有 lease token 失效，API 引用逐一释放，重复 destroy 幂等。普通 `device.createTexture()` 保持独立生命周期，其 destroy 真实调用 Destroy 和 Release。command encoder、pass、command buffer 消费后失效，不能二次使用已经释放的裸句柄。RT 的跨模块输出纹理入口使用同一 resolver。\n\n`RESOURCE_SNAPSHOT` 的 18 类计数记录 bindings 账本拥有的实际 WebGPU API 引用 acquire/release/live/peak。Context/device/adapter/queue 的借用引用与内部临时辅助命令不混入这些计数；它们按各自所有权释放。native API 引用释放、JavaScript wrapper 存活、CPU weak metadata、驱动驻留内存是不同事实，不能把 native live=0 等同于所有对象或全部内存已释放。wrapper/token 按真实 GC finalizer 收尾，仍被 JavaScript 持有的失效 wrapper 不能提前 free。V8 既有 Isolate 最终弱 metadata 析构能力未在本包扩展成完整账本，不声称所有对象绝对无泄漏。\n\nV8 weak 第一遍回调仅 Reset 并安排第二遍；第二遍执行 native Release、外部内存扣账和删除。原每资源 16384 的外部内存估算及 GC 阈值不改。Android 异常按 `MystralJS` 输出有界 message/stack，资源 JSON 用 512 字节 PART 包保留完整内容；这些诊断不改异常传播、调度或门槛。\n\nAndroid 真实 Surface 可能在 owner 线程准备之后、JavaScript 帧执行期间消失。只有 Timeout/Outdated/Lost 且 device/configuration 仍有效时，当前帧才使用同尺寸、格式、usage 的临时纹理，计入同一 Canvas 账本并正常释放；该帧不 SurfacePresent、不作为内部截图。Error、设备丢失和 OOM 不转成静默成功。累计 discard、恢复和清理状态另行限频记录；真实 PixelCopy/ADB compositor 和原恢复时限仍是独立运行门槛。\n\nSurface 暂不可用时，bindings/JS 暂停；Context 最多保留一个旧 presentation Surface 与一个显式 ANativeWindow 引用。新窗口 ready 或正常 teardown 后在 SDL/JavaScript owner 线程退役，device 销毁前也必须释放 held Surface。没有无界 retired 队列，UI 线程不执行 Dawn 释放，不把此范围扩大为 Activity 重建或任意设备丢失恢复。\n\n构建保持完整官方 SDL 3.2.30、V8 11.6.189.22 static/embedded、`c++_static`、SDK build216 与 stage4。固定依赖、完整原始许可与回执通过 `build-profile.json` 哈希引用相邻 `../16k/` 档案；本包另附基线原 MIT 文本，不分发 SDK、依赖二进制或 APK。\n\n`compiled-source/` 原样保存 x64 `android-memory-x64-build-attempt-7` 的 source-before/after/verified 清单。新的本地 clone 在精确基线真实执行 apply-check 与 apply，核对全部 11 个变更路径及完整 116 项编译源码映射。`export.cjs` 是实际 producer，`raw/` 保存命令原件。旧宿主检出、SDK、资产及旧冻结包未因导出而修改。\n\n本包证明源码、补丁应用和编译输入一致，不单独表示 900 秒运行、真机、ARM64、所有 GPU 后端、性能或发布验收通过。运行 acceptance 需另行绑定；已有失败不能删除、重标或由本包的 source PASS 替代。\n',
    ),
);
const producer = put('export.cjs', fs.readFileSync(__filename));
for (const file of sourceFiles)
    assert(
        fs.readFileSync(path.join(host, file)).equals(sourceBefore.get(file)),
        `Host changed during export: ${file}`,
    );
const manifest = json('manifest.json', {
    schema: 'mystral-android-memory-resource-patch-v1',
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
    schema: 'mystral-android-memory-patch-apply-verification-v1',
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
