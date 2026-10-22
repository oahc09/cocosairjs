// Read-only consumer of the actual n4 Release fixture. No compilation or artifact writes.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = process.cwd();
const out = path.join(root, 'tools/physics/box3d/output/command-wasm-release-20261022-n4');
const { verifyCommandQualification, verifyCommandSchedule } = require(path.join(root, 'tools/build/box3d-command-qualification.cjs'));
const read = (name) => fs.readFileSync(path.join(out, name));
const json = (name) => JSON.parse(read(name));
const manifest = json('manifest.json');
const identity = Object.fromEntries(['coreSha', 'bindingBaseSha', 'patchChainSha256', 'abiVersion', 'variant', 'schemaSha256'].map((key) => [key, manifest[key]]));
const receipt = json('build-receipt.json');
verifyCommandSchedule(receipt);
const result = verifyCommandQualification({
    native: json('native-command-contract.raw.json'),
    wasm: json('wasm-command-contract.raw.json'),
    samplesBytes: read('command-samples.raw.jsonl'),
    identity,
    fixtureSha256: createHash('sha256').update(fs.readFileSync(path.join(root, 'tools/physics/box3d/wasm-command-contract.mjs'))).digest('hex'),
    receipt,
});
console.log(JSON.stringify({ status: 'PASS_READ_ONLY_REAL_RELEASE_COMMAND_EVIDENCE_CONSUMER', mode: receipt.mode, commandCount: receipt.commands.length, ...result }, null, 2));
