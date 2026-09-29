/* W14 package size and installed-browser evidence, tied to the exact current bundle.
 * This does not claim npm registry publication or satisfy unrelated release gates.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const root = path.resolve(__dirname, '../..');
const evidence = JSON.parse(
    fs.readFileSync(path.join(root, 'docs/evidence/v11-tarball-browser-consumer.json'), 'utf8'),
);
const sizes = {};
for (const relative of ['build/cocosair.module.js', 'build/cocosair.module.min.js']) {
    const bytes = fs.readFileSync(path.join(root, relative));
    sizes[relative] = {
        bytes: bytes.length,
        sha256_16: crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16),
        gzip: zlib.gzipSync(bytes).length,
        brotli: zlib.brotliCompressSync(bytes).length,
    };
}
const checks = {
    installedImport: evidence.ok === true && evidence.booted === true,
    currentBundle: evidence.installed?.bundleSha256_16 === sizes['build/cocosair.module.js'].sha256_16,
    nestedDeployment: evidence.nested?.booted === true,
    cspWithoutEval: Array.isArray(evidence.nested?.cspErrors) && evidence.nested.cspErrors.length === 0,
    sourceMap:
        evidence.sourceMap?.present === true && evidence.sourceMap.linked === true && evidence.sourceMap.sources > 0,
};
const report = {
    measuredAt: new Date().toISOString(),
    sizes,
    checks,
    note: 'Registry publishing and broader V1.1/V1.2 evidence gates remain separate.',
    verdict: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
};
fs.writeFileSync(path.join(root, 'docs/evidence/w14-package-readiness.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`[w14] ${report.verdict} ${JSON.stringify(checks)}`);
if (report.verdict !== 'PASS') process.exitCode = 1;
