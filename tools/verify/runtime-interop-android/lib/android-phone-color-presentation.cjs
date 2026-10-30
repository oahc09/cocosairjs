/* Retained whole-image ICC interpretation for phone compositor PNGs. No oracle or geometry policy lives here. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { PNG } = require('pngjs');
const program = path.join(__dirname, 'android-phone-color-normalize.py');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const check = (value, message) => {
    if (!value) throw Error(message);
};

function inspectRuntime(python) {
    const code = `import sys,json,hashlib
from pathlib import Path
import PIL
from PIL import Image,ImageCms
def record(file):
 p=Path(file).resolve();return {'file':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
modules={name:record(module.__file__) for name,module in (('PIL',PIL),('PIL.Image',Image),('PIL.ImageCms',ImageCms),('PIL._imaging',Image.core),('PIL._imagingcms',ImageCms.core))}
print(json.dumps({'executable':record(sys.executable),'modules':modules,'versions':{'python':sys.version,'pillow':PIL.__version__,'littlecms':ImageCms.core.littlecms_version}}))`;
    const runtime = JSON.parse(
        execFileSync(python, ['-c', code], {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 10000,
            maxBuffer: 1024 * 1024,
        }),
    );
    runtime.producer = { file: program, sha256: sha256(fs.readFileSync(program)) };
    return runtime;
}

function inputFiles(runtime) {
    return [__filename, program, runtime.executable.file, ...Object.values(runtime.modules).map((item) => item.file)];
}

function normalizeScreen({ python, runtime, inputFile, outputFile, metadataFile, iccFile, timeoutMs = 5000 }) {
    const raw = fs.readFileSync(inputFile),
        source = PNG.sync.read(raw);
    check(sha256(fs.readFileSync(program)) === runtime.producer.sha256, 'ICC helper changed after preflight');
    execFileSync(python, [program, '--input', inputFile, '--output', outputFile, '--metadata', metadataFile], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: Math.max(1, Math.min(5000, timeoutMs)),
        maxBuffer: 1024 * 1024,
    });
    const metadata = JSON.parse(fs.readFileSync(metadataFile));
    const bytes = fs.readFileSync(outputFile),
        normalized = PNG.sync.read(bytes);
    check(
        metadata.schema === 'air-android-png-icc-normalization-v1' &&
            metadata.completed === true &&
            metadata.pass === true &&
            path.resolve(metadata.producer.file) === path.resolve(program) &&
            metadata.producer.sha256 === runtime.producer.sha256,
        'ICC producer receipt differs',
    );
    check(
        JSON.stringify(metadata.modules) === JSON.stringify(runtime.modules) &&
            JSON.stringify(metadata.versions) === JSON.stringify(runtime.versions),
        'ICC Python/Pillow runtime changed',
    );
    for (const [record, file, buffer, image] of [
        [metadata.input, inputFile, raw, source],
        [metadata.output, outputFile, bytes, normalized],
    ]) {
        check(
            path.resolve(record.file) === path.resolve(file) &&
                record.sha256 === sha256(buffer) &&
                record.bytes === buffer.length &&
                record.width === image.width &&
                record.height === image.height,
            'ICC image receipt does not match its original bytes',
        );
    }
    check(
        source.width === normalized.width && source.height === normalized.height,
        'ICC conversion changed the original physical dimensions',
    );
    for (let i = 3; i < source.data.length; i += 4)
        check(source.data[i] === normalized.data[i], 'ICC conversion changed alpha');
    let icc = { present: false };
    if (metadata.icc.present) {
        check(
            metadata.action === 'icc-to-srgb' &&
                metadata.transform?.resize === false &&
                metadata.transform.renderingIntent === 1 &&
                metadata.transform.flags === 0 &&
                metadata.transform.alphaPreserved === true &&
                metadata.transform.fittedFromExpectedPixels === false,
            'ICC conversion policy differs',
        );
        const profile = Buffer.from(metadata.icc.base64, 'base64');
        check(
            profile.length === metadata.icc.bytes && sha256(profile) === metadata.icc.sha256,
            'Retained original ICC bytes differ',
        );
        fs.writeFileSync(iccFile, profile, { flag: 'wx' });
        icc = { present: true, file: iccFile, sha256: sha256(profile), bytes: profile.length };
    } else
        check(
            metadata.action === 'no-icc-byte-preserving-copy' && metadata.transform === null && raw.equals(bytes),
            'PNG without an ICC profile was altered',
        );
    check(fs.readFileSync(inputFile).equals(raw), 'Original compositor PNG changed during ICC interpretation');
    return { bytes, metadata, icc };
}

module.exports = { inspectRuntime, inputFiles, normalizeScreen };
