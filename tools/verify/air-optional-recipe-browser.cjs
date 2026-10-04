#!/usr/bin/env node
'use strict';
// Compatibility entry for the common six-recipe contract, including optional
// services, actual installed sources and the shared application render clock.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const result = spawnSync(process.execPath,
    [path.join(__dirname, 'air-port-recipes-browser.cjs'), ...process.argv.slice(2)],
    { stdio: 'inherit', env: process.env });
if (result.error) { console.error(result.error); process.exitCode = 2; }
else process.exitCode = result.status ?? 2;
