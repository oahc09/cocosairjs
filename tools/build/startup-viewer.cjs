/* Isolated optional build; never an implicit feature change to the default SDK. */
const { existsSync, realpathSync } = require('node:fs');
const { dirname, relative, join, sep, isAbsolute } = require('node:path');

const FEATURES = Object.freeze([
    'air-viewer',
    'gfx-webgl2',
    '3d',
    'animation',
    'skeletal-animation',
    'primitive',
    'legacy-pipeline',
    // Bootstrap references both registries. Keep lightweight defaults so startup
    // does not enter the missing-world path, without including Cannon or Box2D.
    'physics-builtin',
    'physics-2d-builtin',
]);

function realDestination(path) {
    if (existsSync(path)) return realpathSync(path);
    const parent = dirname(path);
    return join(realDestination(parent), relative(parent, path));
}

function assertSeparateOutput({ standard, destination, explicit, incompatible, flag }) {
    const inside = relative(realDestination(standard), realDestination(destination));
    if (
        !explicit ||
        incompatible ||
        !inside ||
        (!inside.startsWith('..' + sep) && inside !== '..' && !isAbsolute(inside))
    ) {
        throw Error(`${flag} requires a separate AIR_OUT_DIR for ESM and no feature, Spark, or combined overrides.`);
    }
}

module.exports = { FEATURES, assertSeparateOutput };
