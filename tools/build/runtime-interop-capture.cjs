/* Build only the external Windows Graphics Capture helper into a new isolated output directory. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const portable = (file) => path.relative(root, file).replace(/\\/g, '/');
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function build(argv) {
    if (process.platform !== 'win32') throw Error('Windows Graphics Capture requires Windows');
    if (argv.length !== 1 || !argv[0].startsWith('--out=')) throw Error('Pass --out=<new-output-directory>');
    const out = path.resolve(root, argv[0].slice(6));
    const relative = path.relative(path.join(root, 'output'), out);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
        throw Error('Capture build output must be a new directory inside output/');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.mkdirSync(out);
    const sources = [
        'tools/verify/runtime-interop/capture/CMakeLists.txt',
        'tools/verify/runtime-interop/capture/capture.cpp',
    ];
    const hashes = () => Object.fromEntries(sources.map((file) => [file, sha256(path.join(root, file))]));
    const report = {
        schema: 'air-runtime-capture-build-v1',
        startedAt: new Date().toISOString(),
        completed: false,
        pass: false,
        sources: hashes(),
        commands: [],
    };
    const reportPath = path.join(out, 'capture-build.json');
    const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    save();
    try {
        for (const [label, args] of [
            ['configure', ['-S', 'tools/verify/runtime-interop/capture', '-B', portable(out), '-A', 'x64']],
            ['build', ['--build', portable(out), '--config', 'Release']],
        ]) {
            const result = spawnSync('cmake', args, {
                cwd: root,
                windowsHide: true,
                encoding: 'utf8',
                timeout: 180000,
                maxBuffer: 16 * 1024 * 1024,
            });
            fs.writeFileSync(path.join(out, `${label}.log`), (result.stdout || '') + (result.stderr || ''));
            report.commands.push({
                command: 'cmake',
                args,
                exitCode: result.status,
                signal: result.signal,
                error: result.error?.message,
                log: `${label}.log`,
            });
            save();
            if (result.error || result.status !== 0 || result.signal)
                throw Error(`Capture ${label} failed; see ${label}.log`);
        }
        const executable = path.join(out, 'Release/cocosair-runtime-capture.exe');
        report.executable = {
            path: portable(executable),
            sha256: sha256(executable),
            bytes: fs.statSync(executable).size,
        };
        report.sourcesAfter = hashes();
        report.completed = true;
        report.pass = JSON.stringify(report.sourcesAfter) === JSON.stringify(report.sources);
        if (!report.pass) throw Error('Capture source changed while building');
    } catch (error) {
        report.error = String(error);
    } finally {
        report.finishedAt = new Date().toISOString();
        save();
    }
    console.log(
        JSON.stringify({
            pass: report.pass,
            report: portable(reportPath),
            executable: report.executable ? path.resolve(root, report.executable.path) : null,
        }),
    );
    return report.pass ? 0 : 1;
}

if (require.main === module) {
    try {
        process.exitCode = build(process.argv.slice(2));
    } catch (error) {
        console.error(String(error));
        process.exitCode = 1;
    }
}
module.exports = { build };
