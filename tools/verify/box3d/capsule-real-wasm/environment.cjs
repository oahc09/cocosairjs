/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
const { root } = require('./inputs.cjs');
const Environment = require(require.resolve('jest-environment-jsdom', { paths: [root] })).TestEnvironment;
module.exports = class CapsuleEnvironment extends Environment {
    async setup() {
        await super.setup();
        this.fixture = globalThis[Symbol.for('box3d.capsule56.cocos-fixture')];
        if (!this.fixture) throw new Error('Real native preload missing; no fallback');
        this.global.__CAPSULE56_FIXTURE__ = this.fixture;
    }
    async teardown() {
        try {
            await this.fixture?.shutdown();
        } finally {
            await super.teardown();
        }
    }
};
