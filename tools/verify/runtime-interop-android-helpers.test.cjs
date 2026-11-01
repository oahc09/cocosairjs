/* CPU-only helper checks. No adb, device, browser, or GPU execution. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PNG } = require('pngjs');
const {
    parseProcessTable,
    isPackageProcess,
} = require('./runtime-interop-android/lib/android-phone-process-table.cjs');
const color = require('./runtime-interop-android/lib/android-phone-color-presentation.cjs');
const python = process.env.AIR_PYTHON || 'python3';
const pillow = spawnSync(python, ['-c', 'from PIL import Image, ImageCms'], { timeout: 10000 });
const pythonUnavailable = pillow.status !== 0 ? 'Python with Pillow/ImageCms is unavailable' : false;

test('process table keeps complete names and selects only the dedicated package', () => {
    const rows = parseProcessTable(
        ' PID NAME\r\n 1 init\r\n 23 kworker/u16:0 events unbound\r\n 47 com.mystral.engine.interop\r\n 48 com.mystral.engine.interop:worker\r\n 49 com.mystral.engine.interop.other\r\n',
    );
    assert.equal(rows[1].name, 'kworker/u16:0 events unbound');
    assert.deepEqual(
        rows.filter((row) => isPackageProcess(row, 'com.mystral.engine.interop')).map((row) => row.pid),
        [47, 48],
    );
    for (const input of [
        'PID CMD\n1 init',
        'PID NAME',
        'PID NAME\n0 init',
        'PID NAME\n2',
        'PID NAME\n9007199254740992 init',
    ]) {
        assert.throws(() => parseProcessTable(input));
    }
});

test('collectors reference the maintained helper directory, not historical snapshots', () => {
    for (const name of [
        'runtime-interop-android-lifecycle.cjs',
        'runtime-interop-android-phone-memory.cjs',
        'runtime-interop-android-phone-lifecycle.cjs',
    ]) {
        const source = fs.readFileSync(path.join(__dirname, name), 'utf8');
        assert.ok(source.includes("const helperRoot = './runtime-interop-android/lib/';"), name);
        assert.ok(!source.includes("const helperRoot = './runtime-interop-android/verification-snapshots/"), name);
    }
});

test(
    'relocated ICC helper binds its actual producer and preserves a no-ICC PNG exactly',
    { skip: pythonUnavailable },
    () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'air-interop-helper-'));
        try {
            const runtime = color.inspectRuntime(python);
            const files = color.inputFiles(runtime);
            assert.ok(files.every((file) => fs.statSync(file).isFile()));
            assert.equal(path.dirname(runtime.producer.file), path.join(__dirname, 'runtime-interop-android/lib'));
            const png = new PNG({ width: 2, height: 2 });
            png.data.set([12, 34, 56, 255, 78, 90, 12, 0, 34, 56, 78, 128, 90, 12, 34, 255]);
            const bytes = PNG.sync.write(png);
            const inputFile = path.join(directory, 'raw.png');
            const outputFile = path.join(directory, 'interpreted.png');
            const metadataFile = path.join(directory, 'receipt.json');
            const iccFile = path.join(directory, 'profile.icc');
            fs.writeFileSync(inputFile, bytes);
            const result = color.normalizeScreen({ python, runtime, inputFile, outputFile, metadataFile, iccFile });
            assert.ok(result.bytes.equals(bytes));
            assert.ok(fs.readFileSync(inputFile).equals(bytes));
            assert.equal(result.metadata.action, 'no-icc-byte-preserving-copy');
            assert.deepEqual(result.icc, { present: false });
            assert.ok(!fs.existsSync(iccFile));
            assert.throws(
                () => color.normalizeScreen({ python, runtime, inputFile, outputFile, metadataFile, iccFile }),
                /new files/,
            );
            assert.ok(fs.readFileSync(outputFile).equals(bytes));
            const stale = { ...runtime, producer: { ...runtime.producer, sha256: '0'.repeat(64) } };
            assert.throws(
                () => color.normalizeScreen({ python, runtime: stale, inputFile, outputFile, metadataFile, iccFile }),
                /changed after preflight/,
            );
        } finally {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    },
);

test('ICC normalizer rejects invalid PNG before writing any output', { skip: pythonUnavailable }, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'air-interop-invalid-png-'));
    try {
        const input = path.join(directory, 'raw.png');
        const output = path.join(directory, 'output.png');
        const metadata = path.join(directory, 'receipt.json');
        fs.writeFileSync(input, 'not a PNG');
        const result = spawnSync(
            python,
            [
                path.join(__dirname, 'runtime-interop-android/lib/android-phone-color-normalize.py'),
                '--input',
                input,
                '--output',
                output,
                '--metadata',
                metadata,
            ],
            { encoding: 'utf8', timeout: 10000 },
        );
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Input must be a PNG/);
        assert.ok(!fs.existsSync(output));
        assert.ok(!fs.existsSync(metadata));
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
