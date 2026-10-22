/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
const path = require('node:path');
const engine = process.env.BOX3D_ENGINE_ROOT || path.resolve(__dirname, '../box3d-rebuild-20261022');
const base = require(path.join(engine, 'jest.config.js'));
module.exports = {
    ...base,
    rootDir: engine,
    roots: [engine, __dirname],
    testMatch: [path.join(__dirname, 'actual-engine.test.cjs')],
    resolver: path.join(__dirname, 'overlay-resolver.cjs'),
    cacheDirectory: path.join(process.env.BOX3D_LISTENER_OUT, 'jest-cache'),
    testTimeout: 60000,
};
