/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
const path = require('node:path');
module.exports = {
    ...require('../../../jest.config.js'),
    rootDir: path.resolve(__dirname, '../../..'),
    testMatch: [
        '<rootDir>/tools/verify/box3d/body-component-real-material-initial-control.test.ts',
        '<rootDir>/tools/verify/box3d/body-component-real-collider-control.test.ts',
    ],
    testTimeout: 60000,
};
