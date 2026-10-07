// Compatibility CLI: the former collector discarded raw observations and is retired.
// Use the independently validated rendering collector; it includes the native subset.
'use strict';
const collector = require('./k0-r2-rendering.cjs');
module.exports = collector;
if (require.main === module) {
    const { spawnSync } = require('node:child_process');
    const path = require('node:path');
    const result = spawnSync(
        process.execPath,
        [path.join(__dirname, 'k0-r2-rendering.cjs'), ...process.argv.slice(2)],
        { stdio: 'inherit', env: process.env },
    );
    process.exitCode = result.status === 0 && !result.signal && !result.error ? 0 : 1;
}
