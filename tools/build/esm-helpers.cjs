/* Normalize a legacy TypeScript helper in memory for the ESM DragonBones
 * dependency. Original npm bytes and ccbuild's warning handler stay intact. */
const path = require('path');
const MagicString = require('magic-string');

function esmHelperPlugin(root) {
    const target = path.resolve(root, 'src/node_modules/@cocos/dragonbones-js/out/dragonBones.js');
    return {
        name: 'air-esm-helpers',
        transform(code, id) {
            if (path.resolve(id) !== target) return null;
            // This package is an ES module. Top-level this cannot supply a helper.
            // Keep the local implementation, including its later reassignment.
            const prefix = 'var __extends = (this && this.__extends) || ';
            const offset = code.indexOf(prefix);
            if (offset < 0) return null; // A future upstream package may fix it.
            const source = new MagicString(code);
            source.remove(offset + 'var __extends = '.length, offset + prefix.length);
            return { code: source.toString(), map: source.generateMap({ hires: true, source: id, includeContent: true }) };
        },
    };
}

async function withESMHelpers(root, build) {
    const entry = require.resolve('@cocos/ccbuild');
    const rollup = require(require.resolve('rollup', { paths: [path.dirname(entry)] }));
    const original = rollup.rollup;
    rollup.rollup = options => original({ ...options, plugins: [esmHelperPlugin(root), ...options.plugins] });
    try { return await build(); }
    finally { rollup.rollup = original; }
}

module.exports = { esmHelperPlugin, withESMHelpers };
