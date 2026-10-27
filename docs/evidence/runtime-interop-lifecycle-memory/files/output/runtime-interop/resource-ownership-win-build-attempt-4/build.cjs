/* New Windows ownership candidate. Invoke only after native sources are frozen; never reuses the old B13 build. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const source = path.join(root, 'output/runtime-interop/mystral-source');
const buildDirectory = path.join(__dirname, 'build');
const priorFile = path.join(root, 'output/runtime-interop/host-build-attempt-13/host-build.json');
const probeFile = path.join(root, 'tools/verify/runtime-interop-android/resource-ownership-probe.mjs');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const save = (name, value) => fs.writeFileSync(path.join(__dirname, name),
    typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const fingerprint = () => {
    const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--',
        'CMakeLists.txt', 'cmake', 'include', 'src', 'android/app/build.gradle.kts', 'android/app/src/main/java'],
        { cwd: source, encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/);
    return Object.fromEntries([...new Set(files)].filter((file) => file && fs.statSync(path.join(source, file)).isFile())
        .sort().map((file) => [file, sha(fs.readFileSync(path.join(source, file)))]));
};
const receipt = { schema: 'air-resource-ownership-windows-build-v1', startedAt: new Date().toISOString(),
    compiled: false, newBuildDirectory: path.relative(root, buildDirectory).replace(/\\/g, '/'),
    source: path.relative(root, source).replace(/\\/g, '/'), commands: [], subset: true, releaseReady: false };
const command = (name, executable, arguments_) => {
    const record = { name, executable, arguments: arguments_, startedAt: new Date().toISOString() };
    receipt.commands.push(record);
    const result = spawnSync(executable, arguments_, { cwd: root, windowsHide: true, encoding: 'buffer',
        timeout: 900000, maxBuffer: 64 * 1024 * 1024 });
    save(name + '.stdout', result.stdout || Buffer.alloc(0));
    save(name + '.stderr', result.stderr || Buffer.alloc(0));
    Object.assign(record, { exitCode: result.status, signal: result.signal, error: result.error && String(result.error),
        finishedAt: new Date().toISOString() });
    if (result.status !== 0 || result.error || result.signal) throw Error(name + ' did not complete successfully');
    return result;
};
try {
    if (fs.existsSync(buildDirectory) || fs.existsSync(path.join(__dirname, 'build-report.json')))
        throw Error('Preserve the previous candidate; use a new build directory');
    const priorBytes = fs.readFileSync(priorFile);
    const prior = JSON.parse(priorBytes);
    const configure = [...prior.commands.find((value) => value.label === 'configure').arguments];
    configure[configure.indexOf('-S') + 1] = source;
    configure[configure.indexOf('-B') + 1] = buildDirectory;
    receipt.reusedConfiguration = { file: path.relative(root, priorFile).replace(/\\/g, '/'), sha256: sha(priorBytes) };
    receipt.probe = { file: path.relative(root, probeFile).replace(/\\/g, '/'), sha256: sha(fs.readFileSync(probeFile)) };
    receipt.producerSha256 = sha(fs.readFileSync(__filename));
    receipt.sourceBefore = fingerprint();
    save('source-before.json', receipt.sourceBefore);
    command('configure', 'cmake', configure);
    command('build', 'cmake', ['--build', buildDirectory, '--config', 'Release', '--parallel', '8', '--target', 'mystral']);
    const generated = path.join(buildDirectory, 'Release/mystral.exe');
    const destination = path.join(__dirname, 'mystral.exe');
    fs.copyFileSync(generated, destination, fs.constants.COPYFILE_EXCL);
    const bytes = fs.readFileSync(destination);
    receipt.executable = { file: path.relative(root, destination).replace(/\\/g, '/'), bytes: bytes.length, sha256: sha(bytes) };
    command('version', destination, ['--version']);
    receipt.sourceAfter = fingerprint();
    save('source-after.json', receipt.sourceAfter);
    receipt.sourceInputsUnchanged = JSON.stringify(receipt.sourceBefore) === JSON.stringify(receipt.sourceAfter);
    if (!receipt.sourceInputsUnchanged || sha(fs.readFileSync(probeFile)) !== receipt.probe.sha256)
        throw Error('Native/probe source changed during the candidate build');
    receipt.compiled = true;
} catch (error) {
    receipt.error = String(error.stack || error);
    process.exitCode = 1;
} finally {
    receipt.finishedAt = new Date().toISOString();
    save('build-report.json', receipt);
    console.log(JSON.stringify({ compiled: receipt.compiled, executable: receipt.executable, error: receipt.error,
        receipt: path.relative(root, path.join(__dirname, 'build-report.json')) }));
}
