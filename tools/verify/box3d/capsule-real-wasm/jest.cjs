/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
const path = require('node:path');
const { root } = require('./inputs.cjs');
module.exports = {
    ...require(path.join(root, 'jest.config.js')),
    rootDir: root,
    roots: [root, __dirname],
    testEnvironment: path.join(__dirname, 'environment.cjs'),
    testMatch: [path.join(__dirname, 'public-capsule.test.ts')],
    testTimeout: 60000,
    cacheDirectory: path.join(process.env.CAPSULE56_OUT, 'jest-cache'),
};
