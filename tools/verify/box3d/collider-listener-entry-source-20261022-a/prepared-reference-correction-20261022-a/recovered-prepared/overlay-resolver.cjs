/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const engine = process.env.BOX3D_ENGINE_ROOT || path.resolve(root, '../box3d-rebuild-20261022');
const variant = process.env.BOX3D_LISTENER_VARIANT;
module.exports = (request, options) => {
    let basedir = options.basedir;
    for (const tree of ['before', 'source']) {
        const prefix = path.join(root, tree) + path.sep;
        if (basedir.startsWith(prefix)) basedir = path.join(engine, path.relative(prefix, basedir));
    }
    const resolved = options.defaultResolver(request, { ...options, basedir });
    const logical = path.relative(engine, resolved);
    if (!logical.startsWith('src/')) return resolved;
    const variantPath = path.join(root, variant, logical);
    const frozenPath = path.join(root, 'before', logical);
    if (variant === 'source' && fs.existsSync(variantPath)) return variantPath;
    return fs.existsSync(frozenPath) ? frozenPath : resolved;
};
