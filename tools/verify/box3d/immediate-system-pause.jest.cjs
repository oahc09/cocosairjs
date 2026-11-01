/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Install these three files directly under tools/verify/box3d/. Requires BOX3D_PAUSE_RAW.
const path = require('node:path');
const os = require('node:os');
const repo = path.resolve(__dirname, '../../..');
module.exports = {
    ...require(path.join(repo, 'jest.config.js')),
    rootDir: repo,
    roots: [__dirname],
    testMatch: [path.join(__dirname, 'immediate-system-pause-control.test.ts')],
    cacheDirectory:
        process.env.BOX3D_PAUSE_JEST_CACHE ?? path.join(os.tmpdir(), 'box3d-immediate-system-pause-jest-cache'),
    testTimeout: 20000,
};
