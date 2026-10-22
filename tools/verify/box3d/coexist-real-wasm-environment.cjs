/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
const Environment = require('jest-environment-jsdom').TestEnvironment;
module.exports = class CoexistRealWasmEnvironment extends Environment {
    async setup() {
        await super.setup();
        this.fixture = globalThis[Symbol.for('cocosair.box3d.coexist-real-wasm')];
        if (!this.fixture) throw new Error('Native coexistence preload missing; no fallback');
        this.global.__BOX3D_COEXIST_FIXTURE__ = this.fixture;
        this.global.fetch = this.fixture.fetchTwoD;
    }
    async teardown() {
        try {
            await this.fixture?.shutdown();
        } finally {
            await super.teardown();
        }
    }
};
