/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Observes original console.error without suppressing or rewriting compiler diagnostics.
// ccbuild prints TypeScript errors without a TS code and can still return an output file.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { format } = require('node:util');
const destination = process.env.AIR_BOX3D_ESM45_DTS_RAW;
assert(destination && !fs.existsSync(destination), 'A fresh DTS diagnostic capture path is required');
const errors = [],
    original = console.error;
console.error = function (...args) {
    errors.push(format(...args));
    return Reflect.apply(original, console, args);
};
process.on('exit', (exitCode) => {
    fs.writeFileSync(
        destination,
        JSON.stringify(
            {
                schema: 'box3d-esm45-dts-console-errors-v1',
                exitCode,
                errorCount: errors.length,
                errors,
                completedAt: new Date().toISOString(),
            },
            null,
            2,
        ) + '\n',
        { flag: 'wx' },
    );
});
