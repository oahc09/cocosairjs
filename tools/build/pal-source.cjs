/* Reproduce Web PAL from the frozen public MIT source, never from engine-pal dist. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '../..');
const SOURCE = path.join(ROOT, 'vendor/pal-source');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function generate() {
    const manifest = JSON.parse(fs.readFileSync(path.join(SOURCE, 'manifest.json')));
    const license = fs.readFileSync(path.join(SOURCE, 'LICENSE'));
    if (hash(license) !== manifest.licenseSha256 || !license.toString().startsWith('MIT License')) throw Error('PAL source license drift');
    if (manifest.typescriptVersion !== ts.version) throw Error('PAL compiler version differs from the frozen manifest');
    const outputs = new Map();
    const notices = [];
    for (const row of manifest.inputs) {
        const bytes = fs.readFileSync(path.join(SOURCE, row.source));
        const blob = crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob ' + bytes.length + '\0'), bytes])).digest('hex');
        if (hash(bytes) !== row.sha256 || blob !== row.gitBlob) throw Error('PAL public source drift: ' + row.source);
        const original = bytes.toString('utf8');
        const header = original.match(/^\/\*[\s\S]*?\*\//);
        if (header && /Copyright/.test(header[0])) notices.push(row.source + '\n' + header[0]);
        let source = original;
        if (/^pal\/input\/web\/(keyboard|mouse|touch)-input\.ts$/.test(row.source) || row.source === 'pal/screen-adapter/web/screen-adapter.ts') {
            source = source.replaceAll("document.getElementById('GameCanvas')", "((globalThis as any).__CC_CANVAS__ || document.getElementById('GameCanvas'))");
        }
        if (row.source === 'pal/env/web/env.ts') {
            source = source.replace("document.querySelector('#GameCanvas')", "((globalThis as any).__CC_CANVAS__ || document.querySelector('#GameCanvas'))");
        }
        if (row.source === 'pal/screen-adapter/web/screen-adapter.ts') {
            source = source.replace('return Math.min(window.devicePixelRatio ?? 1, 2);', 'const cap = Number((window as any).__CCDPR_CAP__); return Math.min(window.devicePixelRatio ?? 1, Number.isFinite(cap) && cap > 0 ? cap : 2);');
            // Match bootstrap and integer drawing buffers for fractional DPR, on first frame and resize.
            source = source.replace('result.width *= dpr;', 'result.width = Math.round(result.width * dpr);');
            source = source.replace('result.height *= dpr;', 'result.height = Math.round(result.height * dpr);');
            source = source.replace(/(this\._gameCanvas = [^;]+;)/, '$1\n        if (!this._gameCanvas && !TEST && !EDITOR) throw new Error("[cocosair] GameCanvas or __CC_CANVAS__ must exist before importing the engine.");');
        }
        const result = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020, newLine: ts.NewLineKind.LineFeed, removeComments: false, useDefineForClassFields: false }, fileName: row.source });
        outputs.set(row.output, original.includes('Permission is hereby granted') ? result.outputText : '/*\n' + license.toString() + '\n*/\n' + result.outputText);
    }
    // Emit the one declaration consumed directly by the engine; avoid retaining npm d.ts bytes.
    const tempBase = path.resolve(os.tmpdir());
    const temp = fs.mkdtempSync(path.join(tempBase, 'cocosair-pal-dts-'));
    try {
        const file = path.join(temp, 'pal-audio-type.ts');
        fs.copyFileSync(path.join(SOURCE, 'pal/audio/type.ts'), file);
        ts.createProgram([file, path.join(ROOT, 'src/@types/globals.d.ts')], { declaration: true, emitDeclarationOnly: true, noEmitOnError: false, types: [], skipLibCheck: true, newLine: ts.NewLineKind.LineFeed, target: ts.ScriptTarget.ES2020 }).emit(undefined, (name, text) => {
            if (name.endsWith('pal-audio-type.d.ts')) {
                const header = fs.readFileSync(path.join(SOURCE, 'pal/audio/type.ts'), 'utf8').match(/^\/\*[\s\S]*?\*\//)[0];
                outputs.set('src/pal/audio/type.d.ts', header + '\n' + text);
            }
        });
    } finally {
        if (!path.resolve(temp).startsWith(tempBase + path.sep)) throw Error('Invalid PAL temp cleanup path');
        fs.rmSync(temp, { recursive: true, force: true });
    }
    if (!outputs.has('src/pal/audio/type.d.ts')) throw Error('PAL declaration emission failed');
    outputs.set('licenses/LICENSE_pal.txt', license);
    outputs.set('licenses/NOTICE_pal.txt', 'Cocos PAL public source notices\nCommit: ' + manifest.revision + '\n\n' + notices.join('\n\n') + '\n');
    return { manifest, outputs };
}

function check() {
    const failures = [];
    try {
        const { outputs } = generate();
        for (const [file, bytes] of outputs) {
            const target = path.join(ROOT, file);
            if (!fs.existsSync(target) || !fs.readFileSync(target).equals(Buffer.from(bytes))) failures.push('PAL generated bytes/notice drift: ' + file);
        }
        const walk = dir => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const file = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(file);
                else if (!outputs.has(path.relative(ROOT, file).replace(/\\/g, '/'))) failures.push('Unregistered PAL output: ' + file);
            }
        };
        walk(path.join(ROOT, 'src/pal'));
    } catch (error) { failures.push(error.message); }
    return failures;
}

if (require.main === module) {
    if (process.argv.includes('--write')) {
        const { outputs } = generate();
        for (const [file, bytes] of outputs) { const target = path.join(ROOT, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes); }
    }
    const failures = check();
    console.log(JSON.stringify({ ok: failures.length === 0, failures }));
    process.exitCode = failures.length ? 1 : 0;
}
module.exports = { generate, check };
