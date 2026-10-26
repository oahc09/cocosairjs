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
const build = path.resolve('output/runtime-interop/android-16k-x64-build-attempt-1');
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

function preserveSdlAndSdk() {
    const materialized = path.resolve('output/runtime-interop/deps-16k-attempt-1');
    const environment = path.resolve('output/runtime-interop/android-16k-env-1');
    const copy = (source, destination) => {
        const bytes = fs.readFileSync(source);
        write(destination, bytes);
        return { file: destination, bytes: bytes.length, sha256: sha256(bytes) };
    };
    const downloadFile = path.resolve('output/runtime-interop/16k-assessment-sdl-1/download-receipt.json');
    const download = JSON.parse(fs.readFileSync(downloadFile));
    assert(
        download.pass === true &&
            download.sha256 === '0525e4bc9cc1370e6d664ec93c927846e311c19a819de05a232bca452b0e3a7a',
    );
    const aarFile = path.join(materialized, 'sdl3/SDL3-3.2.30.aar');
    const zipFile = path.resolve('output/runtime-interop/16k-assessment-sdl-1/SDL3-devel-3.2.30-android.zip');
    assert.equal(sha256(fs.readFileSync(zipFile)), download.sha256);
    assert.equal(sha256(fs.readFileSync(aarFile)), 'ac582807f04c82a8cb80140ce6321598848da4a632fd4531874c60df8e019837');
    const python = JSON.parse(
        fs.readFileSync(path.resolve('output/runtime-interop/android-16k-matrix-attempt-2/report.json')),
    ).colorRuntime.executable.file;
    const code = `import json,zipfile,hashlib,pathlib,sys
p=pathlib.Path(sys.argv[1]); extracted=pathlib.Path(sys.argv[2]); rows=[]
with zipfile.ZipFile(sys.argv[3]) as distribution:
 names=[n for n in distribution.namelist() if n.endswith('/SDL3-3.2.30.aar') or n=='SDL3-3.2.30.aar']
 assert len(names)==1 and distribution.read(names[0])==p.read_bytes()
with zipfile.ZipFile(p) as z:
 for entry in z.infolist():
  if entry.is_dir(): continue
  data=z.read(entry); target=extracted/entry.filename
  assert target.resolve().is_relative_to(extracted.resolve()) and target.read_bytes()==data
  rows.append({'entry':entry.filename,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
print(json.dumps(rows))`;
    const inspected = spawnSync(python, ['-c', code, aarFile, path.join(materialized, 'sdl3/extracted'), zipFile], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 30000,
        maxBuffer: 4 * 1024 * 1024,
    });
    assert.equal(inspected.status, 0, inspected.stderr);
    const aarEntries = JSON.parse(inspected.stdout);
    const versionHeader = fs.readFileSync(
        path.join(materialized, 'sdl3/extracted/prefab/modules/SDL3-Headers/include/SDL3/SDL_version.h'),
        'utf8',
    );
    for (const [field, value] of [
        ['MAJOR', 3],
        ['MINOR', 2],
        ['MICRO', 30],
    ])
        assert.equal(Number(new RegExp('SDL_' + field + '_VERSION\\s+(\\d+)').exec(versionHeader)?.[1]), value);
    const inventory = {
        schema: 'official-sdl330-aar-entry-inventory-v1',
        source: download.url,
        sourceZipSha256: download.sha256,
        aarSha256: sha256(fs.readFileSync(aarFile)),
        entries: aarEntries,
        allExtractedBytesMatchAar: true,
    };
    write('component-manifests/sdl330-aar-entries.json', inventory);
    const dependency = copy(
        path.join(materialized, 'dependency-inputs.json'),
        'dependency-receipts/16k-dependency-inputs.json',
    );
    const producers = [
        'prepare-deps.py',
        'finalize-16k-apk.py',
        'build-16k-arm64-apk-attempt-1.ps1',
        'build-16k-x64-apk-attempt-1.ps1',
    ].map((file) => copy(path.join(materialized, file), 'dependency-producers/' + file));
    const sdlLicense = copy(
        path.join(materialized, 'sdl3/extracted/META-INF/LICENSE.txt'),
        'licenses/LICENSE-SDL3-3.2.30.txt',
    );
    const sdkFiles = [
        ['sdk/emulator/package.xml', 'sdk-provenance/emulator/package.xml'],
        ['sdk/emulator/source.properties', 'sdk-provenance/emulator/source.properties'],
        [
            'sdk/system-images/android-37.0/google_apis_ps16k/x86_64/package.xml',
            'sdk-provenance/system-image/package.xml',
        ],
        [
            'sdk/system-images/android-37.0/google_apis_ps16k/x86_64/source.properties',
            'sdk-provenance/system-image/source.properties',
        ],
        ['sdk-install.log', 'sdk-provenance/sdk-install.log'],
    ].map(([source, destination]) => copy(path.join(environment, source), destination));
    const pkg = fs.readFileSync(
        path.join(environment, 'sdk/system-images/android-37.0/google_apis_ps16k/x86_64/package.xml'),
        'utf8',
    );
    assert(pkg.includes('system-images;android-37.0;google_apis_ps16k;x86_64'));
    const packageRevision = Number(/<revision>\s*<major>(\d+)<\/major>/.exec(pkg)?.[1]);
    const properties = fs.readFileSync(
        path.join(environment, 'sdk/system-images/android-37.0/google_apis_ps16k/x86_64/source.properties'),
        'utf8',
    );
    const sourceRevision = Number(/^Pkg.Revision=(\d+)$/m.exec(properties)?.[1]);
    assert.equal(packageRevision, 8);
    assert.equal(sourceRevision, 7);
    const emulatorProperties = fs.readFileSync(path.join(environment, 'sdk/emulator/source.properties'), 'utf8');
    const emulatorVersion = /^Pkg.Revision=([^\r\n]+)$/m.exec(emulatorProperties)?.[1];
    const emulatorBuildId = /^Pkg.BuildId=([^\r\n]+)$/m.exec(emulatorProperties)?.[1];
    copy(downloadFile, 'dependency-receipts/sdl330-download-receipt.json');
    return {
        sdl: {
            version: '3.2.30',
            distribution: 'Complete official Android AAR, including matching Java, native libraries and Prefab headers',
            source: download.url,
            zipSha256: download.sha256,
            aarSha256: inventory.aarSha256,
            inventory: {
                file: 'component-manifests/sdl330-aar-entries.json',
                sha256: sha256(fs.readFileSync(path.join(out, 'component-manifests/sdl330-aar-entries.json'))),
                entries: aarEntries.length,
            },
            dependency,
            producers,
            license: sdlLicense,
            prefab: [
                'prefab/prefab.json',
                'prefab/modules/SDL3/module.json',
                'prefab/modules/SDL3-shared/module.json',
                'prefab/modules/SDL3-Headers/module.json',
            ].map((name) => aarEntries.find((entry) => entry.entry === name)),
            java: aarEntries.filter((entry) => ['classes.jar', 'classes-sources.jar'].includes(entry.entry)),
            supportedAppAbis: ['arm64-v8a', 'x86_64'],
            noMixedOldJavaOrHeaders: true,
        },
        sdk: {
            package: 'system-images;android-37.0;google_apis_ps16k;x86_64',
            installedPackageRevision: packageRevision,
            sourcePropertiesRevision: sourceRevision,
            emulatorVersion,
            emulatorBuildId,
            metadata: sdkFiles,
            license: 'android-sdk-license text retained inside the original package.xml metadata',
            revisionNote:
                'The vendor source.properties reports revision 7 while installed package.xml and sdkmanager report revision 8; both original records are retained without rewriting.',
            scope: 'Isolated SDK/AVD environment provenance only. Runtime page size and compatibility policy are proved separately by acceptance reports; no SDK image or emulator binary is redistributed.',
        },
    };
}

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
    write('mystral-sdl330-16k.patch', patch);
    const commit = git(host, ['show', '-s', '--format=raw', BASE]);
    write('base-commit.txt', commit);
    const mit = git(host, ['show', BASE + ':LICENSE']);
    write('licenses/LICENSE-MYSTRAL.txt', mit);
    const licenseUrl = 'https://raw.githubusercontent.com/v8/v8/11.6.189.22/LICENSE';
    const retainedLicense = path.resolve(
        'output/runtime-interop/cxx-static-host-patch-attempt-1/licenses/LICENSE-V8-11.6.189.22.txt',
    );
    const v8License = fs.readFileSync(retainedLicense);
    const retainedReceipt = JSON.parse(
        fs.readFileSync(path.join(path.dirname(retainedLicense), 'v8-license-receipt.json')),
    );
    assert.equal(sha256(v8License), retainedReceipt.sha256);
    assert(v8License.length < 65536 && v8License.toString().includes('Copyright 2014, the V8 project authors.'));
    write('licenses/LICENSE-V8-11.6.189.22.txt', v8License);
    const licenseReceipt = {
        source: licenseUrl,
        tag: '11.6.189.22',
        bytes: v8License.length,
        sha256: sha256(v8License),
        fetchedAt: retainedReceipt.fetchedAt,
        retainedFrom: 'cxx-static-host-patch-attempt-1/licenses/LICENSE-V8-11.6.189.22.txt',
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
        schema: 'mystral-cxx-static-sdl330-source-profile-v1',
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
    const components = preserveSdlAndSdk();
    profile.sdlVersion = '3.2.30';
    profile.gradleProperties.mystralSdlVersion = '3.2.30';
    profile.explicitLegacyProfile.mystralSdlVersion = '3.2.8';
    profile.sdl = components.sdl;
    profile.sdkProvenance = components.sdk;
    for (const artifact of profile.v8Artifacts)
        assert.equal(
            sha256(fs.readFileSync(path.resolve('output/runtime-interop/deps-16k-attempt-1', artifact.file))),
            artifact.sha256,
        );
    for (const header of headers)
        assert.equal(
            sha256(fs.readFileSync(path.resolve('output/runtime-interop/deps-16k-attempt-1', header.file))),
            header.sha256,
        );
    profile.licenses.sdl = components.sdl.license.file;
    write('build-profile.json', profile);
    const fresh = path.join(out, 'fresh-base');
    git(out, ['clone', '--no-hardlinks', '--no-checkout', '--', host, fresh]);
    git(fresh, ['checkout', '--detach', BASE]);
    assert.equal(git(fresh, ['rev-parse', 'HEAD']).toString().trim(), BASE);
    assert.equal(git(fresh, ['status', '--porcelain']).length, 0);
    for (const row of rows) assert.equal(sha256(fs.readFileSync(path.join(fresh, row.file))), row.beforeSha256);
    git(fresh, ['apply', '--check', path.join(out, 'mystral-sdl330-16k.patch')]);
    git(fresh, ['apply', path.join(out, 'mystral-sdl330-16k.patch')]);
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
        `# Android c++_static + SDL 3.2.30 / 16KB source patch\n\n` +
        `Base: \`${BASE}\`. Apply to that existing Mystral interop baseline, not directly to the original upstream baseline.\n\n` +
        `\`mystral-sdl330-16k.patch\` changes six files. \`base-source/\` and \`modified-source/\` retain their exact before/after bytes. A fresh local clone was checked out at the fixed base; both \`git apply --check\` and the actual apply passed, and all six applied hashes match current source and the x86_64 compiled source map.\n\n` +
        `Use \`-PmystralAndroidStl=c++_static -PmystralV8LibraryKind=static -PmystralV8StartupData=embedded -PmystralSdlVersion=3.2.30\`. Supply the exact V8 11.6.189.22 static archives and shared include tree in \`build-profile.json\`/\`v8-include-files.json\`. The 118 include-tree files contain 107 C/C++ headers and 11 metadata/protocol files. Binaries are referenced by URL/hash and are not copied into this source package.\n\n` +
        `SDL comes from the complete official 3.2.30 Android distribution: the fixed ZIP, its complete AAR, and every materialized AAR entry were compared byte for byte. Matching Java, native libraries and Prefab headers must stay together. Their inventory and the original SDL license are retained in this package.\n\n` +
        `The isolated Android Emulator 37.2.12 / API 37 Google APIs 16KB x86_64 environment is recorded in \`sdk-provenance/\`. Its installed package.xml reports revision 8 while the vendor source.properties reports 7; both are retained verbatim. SDK license text remains in the package metadata. No SDK binary is redistributed here.\n\n` +
        `Legacy shared startup remains explicit: \`-PmystralAndroidStl=c++_shared -PmystralV8LibraryKind=shared -PmystralV8StartupData=external\`, with its original compatible shared V8 and actual external snapshots. Embedded startup does not read or fabricate an external snapshot. JNI records the actual compiled startup mode and V8 version.\n\n` +
        `Mystral's MIT text and the official [V8 11.6.189.22 root license](${licenseUrl}) are retained verbatim in \`licenses/\`. The V8 root text also lists separately licensed components; this sidecar is not a complete third-party inventory for a redistributed binary.\n\n` +
        `This package provides source/apply/dependency evidence. Runtime acceptance is kept separate; it does not establish physical-device, 16KB-page, performance or release readiness. No original source, SDK, staged asset or prior patch package was modified by this export.\n`;
    const config = await prettier.resolveConfig(path.join(root, 'README.md'));
    write('README.md', await prettier.format(readme, { ...config, filepath: 'README.md' }));
    write('verification.json', {
        schema: 'mystral-cxx-static-sdl330-patch-verification-v1',
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
        schema: 'mystral-cxx-static-sdl330-incremental-patch-v1',
        base: BASE,
        sourceRepository: 'https://github.com/mystralengine/mystralnative',
        sourceFileCount: 6,
        patch: { file: 'mystral-sdl330-16k.patch', bytes: patch.length, sha256: sha256(patch) },
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
            components.sdl.license,
        ],
        producer: { file: 'export.cjs', sha256: sha256(fs.readFileSync(__filename)) },
    });
    console.log(JSON.stringify({ status: 'PASS', files: rows.length, patchSha256: sha256(patch), out: relative(out) }));
}
main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
