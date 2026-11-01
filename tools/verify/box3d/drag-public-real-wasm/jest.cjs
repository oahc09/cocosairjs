/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
const path = require('node:path');
const { root } = require('./inputs.cjs');
module.exports = {
    ...require(path.join(root, 'jest.config.js')),
    rootDir: root,
    roots: [root, __dirname],
    testEnvironment: path.join(__dirname, 'environment.cjs'),
    testMatch: [path.join(__dirname, 'public-drag.test.ts')],
    moduleNameMapper: {
        ...require(path.join(root, 'jest.config.js')).moduleNameMapper,
        '^\\./drag-spring-math\\.js$': path.join(root, 'examples/box3d-rigidbody-playground/src/drag-spring-math.ts'),
    },
    testTimeout: 60000,
    cacheDirectory: path.join(process.env.DRAG76_OUT, 'jest-cache'),
};
