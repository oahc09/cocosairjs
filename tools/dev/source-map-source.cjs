const fs = require('node:fs');
const path = require('node:path');

// Serve original bytes for repository source maps, never transpiled example JS.
function readSourceMapSource(root, pathname) {
    if (typeof pathname !== 'string' || !pathname.startsWith('/src/')) return null;
    const relative = pathname.slice('/src/'.length);
    if (
        !/\.(?:ts|js)$/.test(relative) ||
        relative.includes('\\') ||
        relative.includes('\0') ||
        relative.split('/').some((part) => !part || part === '.' || part === '..')
    )
        return null;
    try {
        const sourceRoot = fs.realpathSync(path.join(root, 'src'));
        const file = fs.realpathSync(path.join(sourceRoot, relative));
        if (!file.startsWith(sourceRoot + path.sep) || !fs.statSync(file).isFile()) return null;
        return fs.readFileSync(file);
    } catch (error) {
        if (['ENOENT', 'ENOTDIR', 'EACCES', 'ELOOP'].includes(error.code)) return null;
        throw error;
    }
}

module.exports = { readSourceMapSource };
