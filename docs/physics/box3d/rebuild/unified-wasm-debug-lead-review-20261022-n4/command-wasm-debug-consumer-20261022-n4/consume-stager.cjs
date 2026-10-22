// Verify only. Does not call stageBox3DAssets or write artifact/SDK directories.
const path = require('node:path');
const { verifySTBuild } = require(path.join(process.cwd(), 'tools/build/box3d-assets.cjs'));
(async () => {
    const result = await verifySTBuild('tools/physics/box3d/output/command-wasm-debug-20261022-n4');
    console.log(JSON.stringify({ status: 'PASS_SINGLE_DEBUG_VERIFY_ST_BUILD_NO_COPY', mode: result.mode, descriptor: result.descriptor, auditSha256: result.auditSha256, readableAssetNames: [...result.bytes.keys()], qualificationGateSources: result.qualificationGateSources }, null, 2));
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
