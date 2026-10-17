/* Windows desktop verification. Writes only a new --out tree plus npm's normal prepack copies.
 * No builds, dependency upgrades, commits or publication. Safari stays an external acceptance item.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');
const { sourceFingerprint } = require('./webgpu-candidate.cjs');
const root = path.resolve(__dirname, '../..');
const out = process.argv.find((arg) => arg.startsWith('--out='))?.slice(6);
if (!out || fs.existsSync(path.resolve(root, out))) throw Error('Pass --out=<new directory>.');
const directory = path.resolve(root, out);
const resume = process.argv.find((arg) => arg.startsWith('--resume='))?.slice(9);
const resumeDirectory = resume && path.resolve(root, resume);
if (resumeDirectory && directory.toLowerCase().startsWith(resumeDirectory.toLowerCase() + path.sep))
    throw Error('Resume output must be outside its input tree.');
fs.mkdirSync(directory, { recursive: true });
const source = sourceFingerprint(root);
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const probe = digest(
    Buffer.concat(
        [
            'webgpu-backend.cjs',
            'webgpu-resource-contracts.cjs',
            'webgpu-custom-pipeline.cjs',
            'webgpu-candidate.cjs',
            'browser-engines.cjs',
        ].map((name) => fs.readFileSync(path.join(__dirname, name))),
    ),
);

function reuse(name, expectedExit) {
    if (!resumeDirectory) return null;
    try {
        const receipt = JSON.parse(fs.readFileSync(path.join(resumeDirectory, name + '-execution.json'), 'utf8'));
        if (receipt.timedOut || receipt.exitCode !== expectedExit) return null;
        const names = name === 'consumer' ? ['package', 'package-min'] : [name];
        const hashes = {};
        for (const folder of names) {
            const filename = path.join(resumeDirectory, folder, 'report.json');
            const bytes = fs.readFileSync(filename);
            const report = JSON.parse(bytes);
            if (!report.completed) return null;
            if (name === 'environment') {
                if (report.probeSha256 !== digest(fs.readFileSync(path.join(__dirname, 'webgpu-environment.cjs'))))
                    return null;
            } else if (
                !report.sourceUnchanged ||
                report.sourceSha256 !== source ||
                report.probeSha256 !== probe ||
                !report.scope?.examples ||
                !report.scope?.custom ||
                report.buildSources.mismatches.length ||
                report.status !== (name === 'webkit' ? 'BLOCKED' : 'PASS')
            )
                return null;
            hashes[folder] = digest(bytes);
        }
        for (const folder of names)
            fs.cpSync(path.join(resumeDirectory, folder), path.join(directory, folder), {
                recursive: true,
                errorOnExist: true,
            });
        fs.copyFileSync(path.join(resumeDirectory, name + '.log'), path.join(directory, name + '.log'));
        const copied = { ...receipt, reusedFrom: resumeDirectory, reusedReportSha256: hashes };
        fs.writeFileSync(path.join(directory, name + '-execution.json'), JSON.stringify(copied, null, 2) + '\n');
        console.log(JSON.stringify({ name, reusedFrom: resumeDirectory, exitCode: copied.exitCode }));
        return copied;
    } catch {
        return null;
    }
}

async function execute(name, script, args, expectedExit) {
    const reused = reuse(name, expectedExit);
    if (reused) return reused;
    const target = path.join(directory, name);
    const logFile = path.join(directory, name + '.log');
    const log = fs.openSync(logFile, 'wx');
    const argv = [path.join(root, 'tools/verify', script), ...args];
    const receipt = {
        name,
        command: [process.execPath, ...argv],
        startedAt: new Date().toISOString(),
        expectedExit,
        browserPath: process.env.AIR_CHROMIUM_PATH || null,
    };
    try {
        await new Promise((resolve) => {
            const child = spawn(process.execPath, argv, {
                cwd: root,
                env: process.env,
                windowsHide: true,
                stdio: ['ignore', log, log],
            });
            const timeout = setTimeout(
                () => {
                    receipt.timedOut = true;
                    if (process.platform === 'win32')
                        spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
                            windowsHide: true,
                            stdio: 'ignore',
                        });
                    else child.kill();
                },
                name === 'firefox' ? 900000 : 300000,
            );
            child.once('error', (error) => {
                receipt.error = String(error);
            });
            child.once('close', (code, signal) => {
                clearTimeout(timeout);
                receipt.exitCode = code;
                receipt.signal = signal;
                resolve();
            });
        });
    } finally {
        fs.closeSync(log);
    }
    receipt.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(directory, name + '-execution.json'), JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify({ name, exitCode: receipt.exitCode, expectedExit }));
    return receipt;
}

(async () => {
    // Only this preflight opens multiple headed browser profiles. Finish it before Firefox screenshots.
    const receipts = [
        await execute('environment', 'webgpu-environment.cjs', [`--out=${path.join(directory, 'environment')}`], 0),
    ];
    const browsers = await Promise.all(
        ['chromium', 'edge', 'firefox', 'webkit'].map((engine) =>
            execute(
                engine,
                'webgpu-backend.cjs',
                [
                    `--engine=${engine}`,
                    '--examples',
                    '--custom',
                    ...(engine === 'firefox' ? ['--headed', '--firefox-fixed-refresh'] : []),
                    `--out=${path.join(directory, engine)}`,
                ],
                engine === 'webkit' ? 1 : 0,
            ),
        ),
    );
    receipts.push(...browsers);
    receipts.push(
        await execute('consumer', 'consumer-acceptance.cjs', ['--webgpu-full', `--webgpu-out=${directory}`], 0),
    );
    const passed = receipts.every((receipt) => !receipt.timedOut && receipt.exitCode === receipt.expectedExit);
    fs.writeFileSync(
        path.join(directory, 'execution.json'),
        JSON.stringify({ completed: true, passed, receipts }, null, 2) + '\n',
    );
    process.exitCode = passed ? 0 : 1;
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
