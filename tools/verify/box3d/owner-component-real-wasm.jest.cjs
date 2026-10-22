/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
const path = require('node:path');
module.exports = {
    ...require('../../../jest.config.js'),
    rootDir: path.resolve(__dirname, '../../..'),
    testEnvironment: '<rootDir>/tools/verify/box3d/owner-component-real-wasm-environment.cjs',
    testMatch: ['<rootDir>/tools/verify/box3d/owner-component-real-wasm.test.ts'],
    testTimeout: 60000,
};
