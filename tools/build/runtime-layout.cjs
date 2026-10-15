const fs = require('node:fs');
const path = require('node:path');

const runtimeBundles = ['cocosair.module.js', 'cocosair.module.min.js'];
const retiredEntries = [
    'bootstrap.js', 'bootstrap.js.map', 'bootstrap.d.ts', 'bootstrap.legacy.d.ts',
    'html-source.js', 'html-source.js.map', 'html-source.d.ts',
];

// Remove only the retired entry files; decoder assets and other variants stay intact.
function removeRetiredEntries(buildDir) {
    for (const filename of retiredEntries) fs.rmSync(path.join(buildDir, filename), { force: true });
    for (const filename of ['bootstrap.js', 'html-source.js']) {
        fs.rmSync(path.join(buildDir, 'npm', filename), { force: true });
    }
}

module.exports = { runtimeBundles, removeRetiredEntries };
