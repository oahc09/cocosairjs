/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
const Environment = require('jest-environment-jsdom').TestEnvironment;
module.exports = class Box3DRealWasmEnvironment extends Environment {
    async setup() {
        await super.setup();
        this.fixture = globalThis[Symbol.for('cocosair.box3d.real-wasm-fixture')];
        if (!this.fixture) throw new Error('Real native preload missing; no fallback fixture is allowed');
        this.global.__BOX3D_REAL_WASM_FIXTURE__ = this.fixture;
    }
    async teardown() {
        try {
            await this.fixture?.shutdown();
        } finally {
            await super.teardown();
        }
    }
};
