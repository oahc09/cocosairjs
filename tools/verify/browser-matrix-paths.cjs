const path = require('node:path');
const fs = require('node:fs');

// Historical Windows reports used backslashes. Accept their equivalent relative
// spelling while keeping the recorded path in the matrix namespace.
function matrixPath(recorded) {
    if (typeof recorded !== 'string') throw new Error('Invalid matrix artifact path');
    const portable = recorded.replace(/\\/g, '/');
    const parts = portable.split('/');
    if (
        parts.length !== 5 ||
        parts.slice(0, 3).join('/') !== 'docs/evidence/browser-matrix' ||
        !/^[\w-]+$/.test(parts[3]) ||
        !/^matrix-(?:chromium|firefox|webkit)(?:-before)?\.png$/.test(parts[4])
    )
        throw new Error('Invalid matrix artifact path');
    return portable;
}

function screenshotPath(example, engine, before = false) {
    return matrixPath(`docs/evidence/browser-matrix/${example}/matrix-${engine}${before ? '-before' : ''}.png`);
}

function resolveScreenshot(repo, recorded) {
    const portable = matrixPath(recorded);
    const root = path.resolve(repo);
    const resolved = path.resolve(root, portable);
    let realRoot;
    try {
        realRoot = fs.realpathSync(root);
    } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return resolved;
        throw error;
    }
    // Check every existing prefix too: an outside directory link is invalid even
    // when the final screenshot has not been created. Ordinary missing files
    // still resolve normally so the caller retains its existing presence check.
    let cursor = root;
    for (const part of portable.split('/')) {
        cursor = path.join(cursor, part);
        let real;
        try {
            real = fs.realpathSync(cursor);
        } catch (error) {
            if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return resolved;
            throw error;
        }
        const relative = path.relative(realRoot, real);
        if (path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`))
            throw new Error('Matrix artifact path escapes repository');
    }
    return resolved;
}

module.exports = { screenshotPath, resolveScreenshot };
