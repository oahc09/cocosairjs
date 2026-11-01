/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
const path = require('node:path');
const base = require('../../../jest.config.js');
const { twoDModuleUrl } = require('./coexist-real-wasm-inputs.cjs');
const escaped = twoDModuleUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
module.exports = {
    ...base,
    rootDir: path.resolve(__dirname, '../../..'),
    moduleNameMapper: {
        ...base.moduleNameMapper,
        ['^' + escaped + '$']: '<rootDir>/tools/verify/box3d/coexist-real-wasm-factory.cjs',
    },
    testEnvironment: '<rootDir>/tools/verify/box3d/coexist-real-wasm-environment.cjs',
    testMatch: ['<rootDir>/tools/verify/box3d/coexist-real-wasm.test.ts'],
    testTimeout: 60000,
};
