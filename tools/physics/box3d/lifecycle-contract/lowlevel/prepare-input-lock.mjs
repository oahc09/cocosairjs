// CPU only: hashes bytes and validates manifest/schema; never imports the runtime or loads WASM.
import assert from 'node:assert/strict';
import { writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectInputs } from './contract.mjs';
assert.equal(process.argv.length, 5, 'usage: node prepare-input-lock.mjs RUNTIME SOURCE FRESH_LOCK');
const [runtime, source, out] = process.argv.slice(2).map((p) => resolve(p));
assert.equal(existsSync(out), false, 'never replace an input lock');
const inputs = inspectInputs(runtime, source, dirname(fileURLToPath(import.meta.url)));
writeFileSync(out, JSON.stringify(inputs, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: 'CPU_INPUT_LOCK_PREPARED_NO_NATIVE_EXECUTION', out }));
