const tracker = require('./owned-process-tracker.cjs');
const { spawn } = require('child_process'),
    path = require('path');
const defaultPath = process.env.SUPERVISOR_CPU_DEFAULT_BROWSER === '1';
const browserExecutable = defaultPath ? '/bin/sleep' : path.join(__dirname, 'dummy-run-webkit-local-deps.sh');
tracker.configureBrowserExecutable(browserExecutable);
const kids = [
    spawn(browserExecutable, defaultPath ? ['60'] : [], { detached: true, stdio: 'ignore' }),
    spawn('python', ['-c', 'import time; time.sleep(60)', '/tools/dev-server.py'], { detached: true, stdio: 'ignore' }),
];
process.on('message', (m) => {
    if (!m.reviewAbort) return;
    for (const row of tracker.rows) tracker.signal(row, 'SIGTERM');
    setTimeout(() => {
        console.log(JSON.stringify(tracker.snapshot()));
        if (process.connected) process.disconnect();
    }, 250);
});
setInterval(() => {}, 1000).unref();
