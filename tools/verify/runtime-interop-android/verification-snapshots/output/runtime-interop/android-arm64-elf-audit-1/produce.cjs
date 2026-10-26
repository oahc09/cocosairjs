/* Offline ELF audit. Reads the fixed candidate APK; writes only this new audit directory. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const JSZip = require('jszip');

const root = path.resolve(__dirname, '../../..');
const apkFile = 'output/runtime-interop/android-arm64-build-attempt-1/app-debug.apk';
const expectedApkSha256 = 'b59938748912dcbfe76ab8b96cf849301b6b18519d3706418c380a535903a86e';
const reportFile = path.join(__dirname, 'report.json');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const assert = (value, message) => {
    if (!value) throw Error(message);
};
const hex = (value) => '0x' + value.toString(16);
const aligned = (value, alignment) => Math.ceil(value / alignment) * alignment;
const files = ['libSDL3.so', 'libc++_shared.so', 'libmystral-runtime.so', 'libv8android.so'].map(
    (name) => 'lib/arm64-v8a/' + name,
);

function zipEntries(bytes) {
    let end = -1;
    for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
        if (
            bytes.readUInt32LE(offset) === 0x06054b50 &&
            offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length
        ) {
            end = offset;
            break;
        }
    }
    assert(end >= 0, 'ZIP end record absent');
    assert(bytes.readUInt16LE(end + 4) === 0 && bytes.readUInt16LE(end + 6) === 0, 'Split ZIP unsupported');
    const count = bytes.readUInt16LE(end + 10);
    let offset = bytes.readUInt32LE(end + 16);
    assert(count !== 0xffff && offset !== 0xffffffff, 'ZIP64 needs a different parser');
    const entries = new Map();
    for (let index = 0; index < count; index++) {
        assert(bytes.readUInt32LE(offset) === 0x02014b50, 'Bad ZIP central header');
        const nameLength = bytes.readUInt16LE(offset + 28);
        const extraLength = bytes.readUInt16LE(offset + 30);
        const commentLength = bytes.readUInt16LE(offset + 32);
        const name = bytes.toString('utf8', offset + 46, offset + 46 + nameLength);
        assert(!entries.has(name), 'Duplicate ZIP entry: ' + name);
        entries.set(name, {
            method: bytes.readUInt16LE(offset + 10),
            compressedBytes: bytes.readUInt32LE(offset + 20),
            uncompressedBytes: bytes.readUInt32LE(offset + 24),
            localHeaderOffset: bytes.readUInt32LE(offset + 42),
        });
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
}

function inspectElf(bytes) {
    assert(bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])), 'Not ELF');
    assert(bytes[4] === 2 && bytes[5] === 1 && bytes.readUInt16LE(18) === 183, 'Expected little-endian ELF64 AArch64');
    const u64 = (offset) => {
        const value = bytes.readBigUInt64LE(offset);
        assert(value <= BigInt(Number.MAX_SAFE_INTEGER), 'ELF value exceeds safe integer range');
        return Number(value);
    };
    const offset = u64(32);
    const entryBytes = bytes.readUInt16LE(54);
    const count = bytes.readUInt16LE(56);
    assert(entryBytes >= 56 && offset + count * entryBytes <= bytes.length, 'Invalid ELF PHDR range');
    const phdrs = [];
    for (let index = 0; index < count; index++) {
        const p = offset + index * entryBytes;
        const type = bytes.readUInt32LE(p);
        phdrs.push({
            index,
            type,
            typeHex: hex(type),
            typeName: type === 1 ? 'PT_LOAD' : type === 0x6474e552 ? 'PT_GNU_RELRO' : 'OTHER',
            flags: bytes.readUInt32LE(p + 4),
            offset: u64(p + 8),
            vaddr: u64(p + 16),
            paddr: u64(p + 24),
            filesz: u64(p + 32),
            memsz: u64(p + 40),
            align: u64(p + 48),
        });
    }
    const loads = phdrs.filter((p) => p.type === 1);
    assert(loads.length > 0, 'ELF has no LOAD segments');
    const loadAlignment16KB = loads.every((p) => p.align >= 16384 && (p.vaddr - p.offset) % 16384 === 0);
    const relro = phdrs
        .filter((p) => p.type === 0x6474e552)
        .map((p) => {
            const ownLoad = loads.find((l) => l.vaddr === p.vaddr && l.memsz === p.memsz && l.filesz === p.filesz);
            const protectedStart = Math.floor(p.vaddr / 16384) * 16384;
            const protectedEnd = aligned(p.vaddr + p.memsz, 16384);
            const otherWritableLoads = loads.filter((l) => (l.flags & 2) !== 0 && l !== ownLoad);
            const noOtherWritableLoadInProtectedPages = otherWritableLoads.every(
                (l) => l.vaddr >= protectedEnd || l.vaddr + l.memsz <= protectedStart,
            );
            const endAligned16KB = (p.vaddr + p.memsz) % 16384 === 0;
            const ownLoadException = !!ownLoad && noOtherWritableLoadInProtectedPages;
            return {
                phdrIndex: p.index,
                endAddress: p.vaddr + p.memsz,
                endAddressHex: hex(p.vaddr + p.memsz),
                endAligned16KB,
                containingOwnLoadIndex: ownLoad?.index ?? null,
                protectedStart,
                protectedEnd,
                noOtherWritableLoadInProtectedPages,
                ownLoadException,
                staticAlignmentSafe: endAligned16KB || ownLoadException,
                reasoning: endAligned16KB
                    ? 'RELRO ends on a 16 KB boundary.'
                    : ownLoadException
                      ? 'RELRO exactly occupies its LOAD; other writable LOADs do not overlap the rounded protection pages.'
                      : 'The simple 16 KB RELRO end/own-LOAD checks do not establish safe protection.',
            };
        });
    return {
        elfClass: 'ELF64',
        endianness: 'little',
        machine: 'AArch64',
        machineCode: 183,
        phdrOffset: offset,
        phdrEntryBytes: entryBytes,
        phdrCount: count,
        phdrs,
        loadPhdrIndices: loads.map((p) => p.index),
        loadAlignments: loads.map((p) => p.align),
        loadAlignment16KB,
        relro,
        static16KBElfAlignment: loadAlignment16KB && relro.every((p) => p.staticAlignmentSafe),
    };
}

(async () => {
    assert(!fs.existsSync(reportFile), 'Preserve the existing audit; use a new attempt directory');
    const apk = fs.readFileSync(path.join(root, apkFile));
    assert(sha256(apk) === expectedApkSha256, 'Candidate APK fingerprint changed');
    const central = zipEntries(apk);
    const zip = await JSZip.loadAsync(apk, { checkCRC32: true });
    const actualLibraries = [...central.keys()].filter((name) => /^lib\/.*\.so$/.test(name)).sort();
    assert(JSON.stringify(actualLibraries) === JSON.stringify([...files].sort()), 'Unexpected native library set');
    const libraries = [];
    for (const file of files) {
        const data = await zip.file(file).async('nodebuffer');
        const entry = central.get(file);
        assert(data.length === entry.uncompressedBytes, 'ZIP entry byte count mismatch');
        libraries.push({
            file,
            bytes: data.length,
            sha256: sha256(data),
            zip: { ...entry, compressionName: entry.method === 8 ? 'DEFLATE' : entry.method === 0 ? 'STORE' : 'OTHER' },
            ...inspectElf(data),
        });
    }
    const v8ReceiptFile = 'output/runtime-interop/android-build-deps-attempt-1/v8/receipt.json';
    const v8ReceiptBytes = fs.readFileSync(path.join(root, v8ReceiptFile));
    const v8Receipt = JSON.parse(v8ReceiptBytes);
    const armV8 = v8Receipt.abis.find((entry) => entry.abi === 'arm64-v8a');
    assert(
        armV8.library.sha256 === libraries.find((entry) => entry.file.endsWith('/libv8android.so')).sha256,
        'V8 producer receipt does not match the actual APK library',
    );
    const report = {
        schema: 'air-android-elf-offline-audit-v1',
        measuredAt: new Date().toISOString(),
        completed: true,
        status: 'COMPLETE_WITH_16KB_ALIGNMENT_GAP',
        auditPassed: true,
        noDeviceOperations: true,
        noBinaryOrDependencyMutations: true,
        apk: { file: apkFile, bytes: apk.length, sha256: sha256(apk) },
        producer: {
            file: path.relative(root, __filename).replaceAll('\\', '/'),
            sha256: sha256(fs.readFileSync(__filename)),
            nodeVersion: process.version,
            jszipVersion: require('jszip/package.json').version,
        },
        libraries,
        v8Producer: {
            publisher: v8Receipt.publisher,
            package: v8Receipt.package,
            packageVersion: v8Receipt.version,
            v8Version: v8Receipt.v8Version,
            receipt: { file: v8ReceiptFile, sha256: sha256(v8ReceiptBytes) },
            tarballUrl: 'https://registry.npmjs.org/v8-android-jit/-/v8-android-jit-11.1000.4.tgz',
            tarballSha256: v8Receipt.tarballSha256,
            npmIntegrity: v8Receipt.integrity,
            abi: armV8,
        },
        allNativeLibrariesCompressed: libraries.every((l) => l.zip.method === 8),
        wholeApkStatic16KBAligned: libraries.every((l) => l.static16KBElfAlignment),
        blockingLibraries: libraries.filter((l) => !l.static16KBElfAlignment).map((l) => l.file),
        actual16KBEnvironmentAcceptance: { status: 'NOT_RUN', pass: false },
        currentPhoneRuntime: {
            devicePageBytes: 4096,
            source: 'Parent-observed getconf PAGESIZE; not remeasured by this offline producer.',
            evidence: 'output/runtime-interop/android-arm64-probes-attempt-2/report.json',
            scope: 'Separate 4 KB phone runtime evidence; that retained attempt failed compositor presentation because the system debug warning covered the surface.',
            establishes16KBAcceptance: false,
        },
        conclusions: [
            'SDL3 and V8 have real 4096-byte LOAD alignment. The complete APK is not statically 16 KB aligned.',
            'Runtime and libc++ LOAD alignment is 16384; each RELRO occupies its own LOAD with no writable overlap. The warning unknown-error label is not evidence of a 4096-byte LOAD for these two libraries.',
            'All four libraries are DEFLATE-compressed; the uncompressed-library direct-mmap ZIP alignment requirement does not explain this candidate gap.',
            'Static alignment analysis and a functioning 4 KB phone do not establish execution correctness on a 16 KB kernel.',
            'No ELF header, native binary, dependency, application source, system setting, or input report was modified.',
        ],
        sources: [
            {
                title: 'Android official 16 KB page-size guidance, including the RELRO own-LOAD exception',
                url: 'https://developer.android.com/guide/practices/page-sizes',
            },
            { title: 'Kudo fixed package version', url: 'https://www.npmjs.com/package/v8-android-jit/v/11.1000.4' },
            {
                title: 'Kudo build environment source (NDK r23c)',
                url: 'https://github.com/Kudo/v8-android-buildscripts/blob/main/scripts/env.sh',
            },
            {
                title: 'Kudo build recipe source (separate ABI library and snapshot)',
                url: 'https://github.com/Kudo/v8-android-buildscripts/blob/main/scripts/build.sh',
            },
        ],
    };
    assert(
        report.blockingLibraries.length === 2 && report.allNativeLibrariesCompressed,
        'Candidate facts differ from the reviewed input',
    );
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(
        JSON.stringify(
            {
                completed: report.completed,
                auditPassed: report.auditPassed,
                wholeApkStatic16KBAligned: report.wholeApkStatic16KBAligned,
                blockingLibraries: report.blockingLibraries,
                report: path.relative(root, reportFile).replaceAll('\\', '/'),
            },
            null,
            2,
        ),
    );
})().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
