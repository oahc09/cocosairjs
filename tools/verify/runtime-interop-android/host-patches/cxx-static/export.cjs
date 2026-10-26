/* Read-only source export; all mutations are confined to this new output directory and its fresh clone. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const prettier = require('prettier');
const root = process.cwd(),
    out = __dirname;
const host = path.resolve('output/runtime-interop/mystral-source');
const deps = path.resolve('output/runtime-interop/deps-static-attempt-1');
const build = path.resolve('output/runtime-interop/android-static-x64-build-attempt-1');
const BASE = '3cea6b450b71661e114a04b8bde777ff6d29f67f';
const FILES = [
    'CMakeLists.txt',
    'android/app/build.gradle.kts',
    'android/app/src/main/java/com/mystral/engine/InteropServer.java',
    'android/app/src/main/java/com/mystral/engine/MystralActivity.java',
    'src/js/v8_engine.cpp',
    'src/platform/android_main.cpp',
];
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const blobSha = (bytes) =>
    crypto
        .createHash('sha1')
        .update(Buffer.from('blob ' + bytes.length + '\0'))
        .update(bytes)
        .digest('hex');
const relative = (file) => path.relative(root, file).replace(/\\/g, '/');
const write = (file, value) => {
    const target = path.join(out, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
        target,
        Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n',
        { flag: 'wx' },
    );
};
let sequence = 0;
const commands = [];
function git(cwd, args) {
    const result = spawnSync('git', ['-c', 'core.autocrlf=false', ...args], {
        cwd,
        timeout: 120000,
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
    });
    const id = String(++sequence).padStart(2, '0');
    write('raw/git-' + id + '.stdout', result.stdout || Buffer.alloc(0));
    write('raw/git-' + id + '.stderr', result.stderr || Buffer.alloc(0));
    commands.push({
        id,
        cwd: relative(cwd),
        command: 'git',
        arguments: ['-c', 'core.autocrlf=false', ...args],
        status: result.status,
    });
    assert.equal(result.status, 0, 'git ' + args.join(' ') + ': ' + (result.stderr || result.error));
    return result.stdout;
}
const record = (file) => {
    const bytes = fs.readFileSync(file);
    return { file: relative(file), bytes: bytes.length, sha256: sha256(bytes) };
};
const canonical = (map) =>
    JSON.stringify(Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b, 'en'))));

async function main() {
    assert(!fs.existsSync(path.join(out, 'manifest.json')), 'Export directory must be a new attempt');
    assert.equal(git(host, ['rev-parse', 'HEAD']).toString().trim(), BASE);
    const changed = git(host, ['diff', '--name-only', BASE]).toString().trim().split(/\r?\n/).sort();
    assert.deepEqual(changed, [...FILES].sort(), 'Only the six frozen files may enter this patch');
    git(host, ['diff', '--check', BASE, '--', ...FILES]);
    const rows = FILES.map((file) => {
        const before = git(host, ['show', BASE + ':' + file]),
            after = fs.readFileSync(path.join(host, file));
        write('base-source/' + file, before);
        write('modified-source/' + file, after);
        return {
            file,
            beforeBytes: before.length,
            beforeSha256: sha256(before),
            afterBytes: after.length,
            afterSha256: sha256(after),
        };
    });
    const patch = git(host, ['diff', '--binary', '--full-index', BASE, '--', ...FILES]);
    write('mystral-cxx-static.patch', patch);
    const commit = git(host, ['show', '-s', '--format=raw', BASE]);
    write('base-commit.txt', commit);
    const mit = git(host, ['show', BASE + ':LICENSE']);
    write('licenses/LICENSE-MYSTRAL.txt', mit);
    const licenseUrl = 'https://raw.githubusercontent.com/v8/v8/11.6.189.22/LICENSE';
    const response = await fetch(licenseUrl, { signal: AbortSignal.timeout(20000) });
    assert(response.ok, 'Official V8 license download failed');
    const v8License = Buffer.from(await response.arrayBuffer());
    assert(v8License.length < 65536 && v8License.toString().includes('Copyright 2014, the V8 project authors.'));
    write('licenses/LICENSE-V8-11.6.189.22.txt', v8License);
    const licenseReceipt = {
        source: licenseUrl,
        tag: '11.6.189.22',
        bytes: v8License.length,
        sha256: sha256(v8License),
        fetchedAt: new Date().toISOString(),
        scope: 'V8 root BSD license, including its original externally-maintained-library notice; not a complete binary third-party license inventory.',
    };
    write('licenses/v8-license-receipt.json', licenseReceipt);
    const receiptFiles = [
        'v8-download-receipt.json',
        'v8-download-receipt-x64.json',
        'download-manifest.json',
        'download-manifest-x64.json',
        'x64-header-equivalence.json',
    ];
    const receipts = receiptFiles.map((file) => {
        const bytes = fs.readFileSync(path.join(deps, file));
        write('dependency-receipts/' + file, bytes);
        return { file: 'dependency-receipts/' + file, sha256: sha256(bytes), bytes: bytes.length };
    });
    const arm = JSON.parse(fs.readFileSync(path.join(deps, receiptFiles[0])));
    const x64 = JSON.parse(fs.readFileSync(path.join(deps, receiptFiles[1])));
    assert(arm.pass === true && x64.pass === true && arm.ref === x64.ref && arm.v8Version === '11.6.189.22');
    const artifacts = [...arm.files.filter((row) => row.source.endsWith('.a')), ...[x64.files].flat()];
    for (const row of artifacts) {
        const bytes = fs.readFileSync(path.join(deps, row.destination));
        assert.equal(sha256(bytes), row.sha256);
        assert.equal(bytes.length, row.bytes);
        assert.equal(blobSha(bytes), row.gitBlobSha1);
    }
    const headers = arm.files
        .filter((row) => row.destination.startsWith('v8/include/'))
        .map((row) => {
            const bytes = fs.readFileSync(path.join(deps, row.destination));
            assert(
                row.pass === true &&
                    sha256(bytes) === row.sha256 &&
                    bytes.length === row.bytes &&
                    blobSha(bytes) === row.gitBlobSha1,
            );
            return {
                file: row.destination,
                bytes: row.bytes,
                sha256: row.sha256,
                gitBlobSha1: row.gitBlobSha1,
                source: row.url,
            };
        })
        .sort((a, b) => a.file.localeCompare(b.file, 'en'));
    assert.equal(headers.length, 118);
    const equivalence = JSON.parse(fs.readFileSync(path.join(deps, 'x64-header-equivalence.json')));
    assert(equivalence.allTopLevelObjectsIdentical === true && equivalence.ref === arm.ref);
    write('v8-include-files.json', {
        schema: 'fixed-v8-include-files-v1',
        repository: arm.repository,
        ref: arm.ref,
        files: headers,
        count: headers.length,
        hFiles: headers.filter((row) => row.file.endsWith('.h')).length,
        canonicalFilesSha256: sha256(
            Buffer.from(canonical(Object.fromEntries(headers.map((row) => [row.file, row.sha256])))),
        ),
    });
    const profile = {
        schema: 'mystral-cxx-static-source-profile-v1',
        androidStl: 'c++_static',
        v8LibraryKind: 'static',
        v8StartupMode: 'embedded',
        v8Version: arm.v8Version,
        repository: arm.repository,
        ref: arm.ref,
        gradleProperties: {
            mystralAndroidStl: 'c++_static',
            mystralV8LibraryKind: 'static',
            mystralV8StartupData: 'embedded',
        },
        explicitLegacyProfile: {
            mystralAndroidStl: 'c++_shared',
            mystralV8LibraryKind: 'shared',
            mystralV8StartupData: 'external',
            dependencyProvider:
                'Use the original matching shared V8 and its real per-ABI external snapshot; the static archive below is not a shared-library replacement.',
        },
        v8Artifacts: artifacts.map((row) => ({
            file: row.destination,
            source: row.url,
            bytes: row.bytes,
            sha256: row.sha256,
            gitBlobSha1: row.gitBlobSha1,
        })),
        includes: {
            file: 'v8-include-files.json',
            count: 118,
            hFiles: 107,
            sharedBy: ['arm64-v8a', 'x86_64'],
            equivalenceReceipt: 'dependency-receipts/x64-header-equivalence.json',
        },
        licenses: {
            mystral: 'licenses/LICENSE-MYSTRAL.txt',
            v8: 'licenses/LICENSE-V8-11.6.189.22.txt',
            v8Source: licenseUrl,
        },
        scope: 'Source configuration and exact V8 dependency identities only. No APK, physical-device, 16KB, performance or release acceptance is granted by this profile.',
    };
    write('build-profile.json', profile);
    const fresh = path.join(out, 'fresh-base');
    git(out, ['clone', '--no-hardlinks', '--no-checkout', '--', host, fresh]);
    git(fresh, ['checkout', '--detach', BASE]);
    assert.equal(git(fresh, ['rev-parse', 'HEAD']).toString().trim(), BASE);
    assert.equal(git(fresh, ['status', '--porcelain']).length, 0);
    for (const row of rows) assert.equal(sha256(fs.readFileSync(path.join(fresh, row.file))), row.beforeSha256);
    git(fresh, ['apply', '--check', path.join(out, 'mystral-cxx-static.patch')]);
    git(fresh, ['apply', path.join(out, 'mystral-cxx-static.patch')]);
    const buildBefore = JSON.parse(fs.readFileSync(path.join(build, 'source-before.json')));
    const buildAfter = JSON.parse(fs.readFileSync(path.join(build, 'source-after.json')));
    assert.equal(canonical(buildBefore), canonical(buildAfter));
    const comparison = rows.map((row) => {
        const applied = sha256(fs.readFileSync(path.join(fresh, row.file)));
        const current = sha256(fs.readFileSync(path.join(host, row.file)));
        assert.equal(applied, row.afterSha256);
        assert.equal(current, row.afterSha256);
        assert.equal(buildAfter[row.file], row.afterSha256);
        return {
            file: row.file,
            appliedSha256: applied,
            currentSha256: current,
            compiledSha256: buildAfter[row.file],
            matches: true,
        };
    });
    assert.deepEqual(
        git(fresh, ['diff', '--name-only', BASE]).toString().trim().split(/\r?\n/).sort(),
        [...FILES].sort(),
    );
    const readme =
        `# Android c++_static incremental host patch\n\n` +
        `Base: \`${BASE}\`. Apply to that existing Mystral interop baseline, not directly to the original upstream baseline.\n\n` +
        `\`mystral-cxx-static.patch\` changes six files. \`base-source/\` and \`modified-source/\` retain their exact before/after bytes. A fresh local clone was checked out at the fixed base; both \`git apply --check\` and the actual apply passed, and all six applied hashes match current source and the x86_64 compiled source map.\n\n` +
        `Use \`-PmystralAndroidStl=c++_static -PmystralV8LibraryKind=static -PmystralV8StartupData=embedded\`. Supply the exact V8 11.6.189.22 static archives and shared include tree in \`build-profile.json\`/\`v8-include-files.json\`. The 118 include-tree files contain 107 C/C++ headers and 11 metadata/protocol files. Binaries are referenced by URL/hash and are not copied into this source package.\n\n` +
        `Legacy shared startup remains explicit: \`-PmystralAndroidStl=c++_shared -PmystralV8LibraryKind=shared -PmystralV8StartupData=external\`, with its original compatible shared V8 and actual external snapshots. Embedded startup does not read or fabricate an external snapshot. JNI records the actual compiled startup mode and V8 version.\n\n` +
        `Mystral's MIT text and the official [V8 11.6.189.22 root license](${licenseUrl}) are retained verbatim in \`licenses/\`. The V8 root text also lists separately licensed components; this sidecar is not a complete third-party inventory for a redistributed binary.\n\n` +
        `This package provides source/apply/dependency evidence. Runtime acceptance is kept separate; it does not establish physical-device, 16KB-page, performance or release readiness. No original source, SDK, staged asset or prior patch package was modified by this export.\n`;
    const config = await prettier.resolveConfig(path.join(root, 'README.md'));
    write('README.md', await prettier.format(readme, { ...config, filepath: 'README.md' }));
    write('verification.json', {
        schema: 'mystral-cxx-static-patch-verification-v1',
        pass: true,
        base: BASE,
        freshClone: 'fresh-base',
        applyCheck: true,
        actualApply: true,
        sourceFiles: comparison,
        compiledSourceMap: record(path.join(build, 'source-after.json')),
        buildReceipt: record(path.join(build, 'build-report.json')),
        sourceMapUnchanged: true,
        hostFilesUnchangedDuringExport: true,
        artifactBytesVerified: true,
        includeFilesVerified: 118,
        commands,
    });
    write('manifest.json', {
        schema: 'mystral-cxx-static-incremental-patch-v1',
        base: BASE,
        sourceRepository: 'https://github.com/mystralengine/mystralnative',
        sourceFileCount: 6,
        patch: { file: 'mystral-cxx-static.patch', bytes: patch.length, sha256: sha256(patch) },
        files: rows,
        buildProfile: {
            file: 'build-profile.json',
            sha256: sha256(fs.readFileSync(path.join(out, 'build-profile.json'))),
        },
        includeManifest: {
            file: 'v8-include-files.json',
            sha256: sha256(fs.readFileSync(path.join(out, 'v8-include-files.json'))),
        },
        receipts,
        licenses: [
            { file: 'licenses/LICENSE-MYSTRAL.txt', sha256: sha256(mit) },
            { file: 'licenses/LICENSE-V8-11.6.189.22.txt', sha256: sha256(v8License), source: licenseUrl },
        ],
        producer: { file: 'export.cjs', sha256: sha256(fs.readFileSync(__filename)) },
    });
    console.log(JSON.stringify({ status: 'PASS', files: rows.length, patchSha256: sha256(patch), out: relative(out) }));
}
main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
