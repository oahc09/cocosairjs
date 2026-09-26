const fs = require('fs');

// TypeScript resolves an emitted .js import to a sibling .ts source. The dev
// server uses the same rule while serving source modules without a bundle.
function resolveScript(file) {
    if (!fs.existsSync(file) && file.endsWith('.js')) {
        const source = file.slice(0, -3) + '.ts';
        if (fs.existsSync(source) && fs.statSync(source).isFile()) return source;
    }
    return file;
}

module.exports = { resolveScript };
