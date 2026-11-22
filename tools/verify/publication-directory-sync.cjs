'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

let windowsHelper;
function getWindowsHelper() {
    if (windowsHelper) return windowsHelper;
    const framework = path.join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET');
    const compiler = ['Framework64', 'Framework']
        .map((platform) => path.join(framework, platform, 'v4.0.30319', 'csc.exe'))
        .find((file) => fs.existsSync(file));
    if (!compiler) throw Error('Windows durable publication requires the .NET Framework C# compiler');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'air-directory-flush-'));
    const executable = path.join(temp, 'flush.exe');
    process.once('exit', () => {
        // A failed temp cleanup cannot change a successful flush into a failure.
        try {
            fs.rmSync(temp, { recursive: true, force: true });
        } catch {
            // The OS or antivirus can hold the executable open at process exit.
        }
    });
    execFileSync(
        compiler,
        ['/nologo', '/target:exe', '/out:' + executable, path.join(__dirname, 'windows-directory-flush.cs')],
        { cwd: temp, windowsHide: true, timeout: 30000, stdio: 'pipe' },
    );
    windowsHelper = executable;
    return executable;
}

function syncDirectory(directory) {
    if (process.platform === 'win32') {
        execFileSync(getWindowsHelper(), [path.toNamespacedPath(path.resolve(directory))], {
            windowsHide: true,
            timeout: 15000,
            stdio: 'pipe',
        });
        return;
    }
    const descriptor = fs.openSync(directory, 'r');
    try {
        fs.fsyncSync(descriptor);
    } finally {
        fs.closeSync(descriptor);
    }
}

module.exports = { syncDirectory };
