/* Read actual LLD maps; retain selected providers rather than inferring safety from link success. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const output = path.join(__dirname, 'map-report.json');
if (fs.existsSync(output)) throw Error('Preserve the previous map audit');
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const records = [];
for (const directory of ['android-16k-arm64-build-attempt-1', 'android-16k-x64-build-attempt-1']) {
    const file = 'output/runtime-interop/' + directory + '/mystral-runtime.map';
    const raw = fs.readFileSync(path.join(root, file));
    let owner = null;
    const symbols = [],
        objects = new Set(),
        runtimeProviders = new Set();
    for (const [index, line] of raw.toString().split(/\r?\n/).entries()) {
        if (line.startsWith('Cross Reference Table')) break;
        if (line.includes('.a(')) {
            const match = /([^\s]+\.a\([^)]*\)):\(/.exec(line);
            if (match) {
                owner = match[1];
                if (/libc\+\+_static\.a\(|libc\+\+abi\.a\(/.test(owner))
                    runtimeProviders.add(owner.split('.a(')[0] + '.a');
                if (
                    /zlib|cpu-features|cpu_features|(?:deflate|inflate|adler32|crc32|inffast|inftrees|trees|zutil)\.o/i.test(
                        owner,
                    )
                )
                    objects.add(owner);
            }
        }
        const fields = line.trim().split(/\s+/);
        if (fields.length === 5 && /^(Cr_z_|android_(?:get|set)Cpu)/.test(fields[4]))
            symbols.push({ symbol: fields[4], provider: owner, mapLine: index + 1 });
    }
    const providers = [
        ...new Set(symbols.filter((s) => s.symbol.startsWith('Cr_z_')).map((s) => s.provider?.split('.a(')[0] + '.a')),
    ];
    records.push({
        file,
        bytes: raw.length,
        sha256: sha(raw),
        selectedCompressionObjects: [...objects].sort(),
        staticRuntimeProviders: [...runtimeProviders].sort(),
        compressionSymbolProviders: providers,
        compressionSymbols: symbols.filter((s) => s.symbol.startsWith('Cr_z_')),
        cpuSymbols: symbols.filter((s) => s.symbol.startsWith('android_')),
        singleCompressionArchiveProvider: providers.length === 1 && providers[0].endsWith('/libv8_monolith.a'),
        readingBoundary:
            'Final map contains selected live sections/symbols; the archive-wide 122 strong-name overlap does not mean both implementations are linked.',
    });
}
const report = {
    schema: 'air-static-map-provider-audit-v1',
    completed: true,
    records,
    producerSha256: sha(fs.readFileSync(__filename)),
};
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(
    JSON.stringify(
        records.map((r) => ({
            file: r.file,
            compressionSymbolProviders: r.compressionSymbolProviders,
            symbols: r.compressionSymbols.length,
            cpuSymbols: r.cpuSymbols.length,
            objects: r.selectedCompressionObjects.slice(0, 14),
            staticRuntimeProviders: r.staticRuntimeProviders,
        })),
        null,
        2,
    ),
);
