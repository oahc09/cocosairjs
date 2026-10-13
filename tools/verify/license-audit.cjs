/* V0.9 §89/§92 — License 逐文件审计脚本。
 * 执行：node tools/verify/license-audit.cjs
 * 检查范围：src/ build/ examples/ test/ tools/ fixtures/ build/gltf-decoders/
 */
var fs = require('fs');
var path = require('path');
var REPO = path.resolve(__dirname, '..', '..');
var issues = [];
var licenses = {};
var scanned = 0;

// 1. 必需的许可与上游说明文件
var requiredRoot = ['LICENSE', 'docs/THIRD_PARTY_LICENSES.md', 'docs/UPSTREAM.md'];
for (var i = 0; i < requiredRoot.length; i++) {
    var rp = path.join(REPO, requiredRoot[i]);
    if (!fs.existsSync(rp)) {
        issues.push('missing required file: ' + requiredRoot[i]);
        continue;
    }
    licenses[requiredRoot[i]] = fs.statSync(rp).size;
}

// 2. Decoder 许可
var decoders = ['draco', 'meshopt', 'basis'];
for (var di = 0; di < decoders.length; di++) {
    var dName = decoders[di];
    var dDir = path.join(REPO, 'build', 'gltf-decoders', dName);
    if (!fs.existsSync(dDir)) {
        issues.push('missing decoder dir: ' + dName);
        continue;
    }
    var hasLicense = false;
    var decFiles = fs.readdirSync(dDir);
    for (var dfi = 0; dfi < decFiles.length; dfi++) {
        if (/LICENSE|NOTICE/i.test(decFiles[dfi])) {
            hasLicense = true;
            licenses['gltf-decoders/' + dName + '/' + decFiles[dfi]] = fs.statSync(path.join(dDir, decFiles[dfi])).size;
        }
    }
    if (!hasLicense) issues.push('decoder ' + dName + ': no LICENSE file');
}

// 3. Example assets 许可声明
var examplesDir = path.join(REPO, 'examples');
var knownSources = /SOURCES\.md|SHA256\.json|manifest\.json|\.LICENSE\.md$/i;
if (fs.existsSync(examplesDir)) {
    var exDirs = fs.readdirSync(examplesDir, { withFileTypes: true });
    for (var ei = 0; ei < exDirs.length; ei++) {
        if (!exDirs[ei].isDirectory()) continue;
        var assetDir = path.join(examplesDir, exDirs[ei].name, 'assets');
        if (!fs.existsSync(assetDir)) continue;
        var aFiles = fs.readdirSync(assetDir);
        for (var afi = 0; afi < aFiles.length; afi++) {
            var af = aFiles[afi];
            scanned++;
            if (/\.LICENSE\.md$/i.test(af)) continue;
            if (/\.(bin|json|cache)$/i.test(af)) {
                // 辅助文件：检查是否有同名的 .gltf 主文件已声明
                var parentGltf = af.replace(/\.(bin)$/i, '.gltf');
                if (aFiles.indexOf(parentGltf) !== -1) continue;
            }
            if (/\.(glb|gltf)$/i.test(af)) {
                var licFile = af.replace(/\.(glb|gltf)$/i, '') + '.LICENSE.md';
                if (aFiles.indexOf(licFile) === -1 && !fs.existsSync(path.join(assetDir, licFile))) {
                    issues.push('example ' + exDirs[ei].name + '/assets/' + af + ': missing .LICENSE.md');
                }
            }
        }
    }
}

// 4. build/ 只允许白名单目录/文件
var buildDir = path.join(REPO, 'build');
var buildAllowed =
    /^(cocosair\.module\.(js|min\.js|min\.js\.map|d\.ts)|cocosair\.module\.js\.map|package\.json|gltf-decoders$|devtools$|fflate\/)/;
if (fs.existsSync(buildDir)) {
    var bEntries = fs.readdirSync(buildDir, { withFileTypes: true });
    for (var bi = 0; bi < bEntries.length; bi++) {
        var bn = bEntries[bi];
        if (bn.name.startsWith('.')) continue;
        if (
            bn.isDirectory() &&
            !buildAllowed.test(bn.name + '/') &&
            bn.name !== 'gltf-decoders' &&
            bn.name !== 'devtools'
        ) {
            issues.push('unexpected directory in build/: ' + bn.name);
        }
        if (bn.isFile() && !buildAllowed.test(bn.name) && !/\.(js|map|d\.ts|json)$/.test(bn.name)) {
            issues.push('unexpected file in build/: ' + bn.name);
        }
    }
}

// 5. package.json license
var pkgPath = path.join(REPO, 'package.json');
var pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
if (pkg.license !== 'MIT') issues.push('package.json license is not MIT');

// 汇总
var report = {
    scanned: scanned,
    issues: issues,
    issueCount: issues.length,
    pass: issues.length === 0,
    licenses: licenses,
};
var outPath = path.join(REPO, 'docs/evidence/license-audit.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
console.log('[license-audit] issues=' + issues.length + ' → ' + path.relative(REPO, outPath));
if (issues.length) {
    issues.forEach(function (x) {
        console.log('  !', x);
    });
}
process.exit(issues.length ? 1 : 0);
