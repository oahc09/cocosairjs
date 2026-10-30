/* Reproduce Web PAL from the frozen public MIT source, never from engine-pal dist. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const ts = require('typescript');
const { replaceExactly, patchStartupBinding } = require('./startup-binding-patch.cjs');
const ROOT = path.resolve(__dirname, '../..');
const SOURCE = path.join(ROOT, 'vendor/pal-source');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function generate() {
    const manifest = JSON.parse(fs.readFileSync(path.join(SOURCE, 'manifest.json')));
    const license = fs.readFileSync(path.join(SOURCE, 'LICENSE'));
    if (hash(license) !== manifest.licenseSha256 || !license.toString().startsWith('MIT License'))
        throw Error('PAL source license drift');
    if (manifest.typescriptVersion !== ts.version) throw Error('PAL compiler version differs from the frozen manifest');
    const outputs = new Map();
    const notices = [];
    for (const row of manifest.inputs) {
        const bytes = fs.readFileSync(path.join(SOURCE, row.source));
        const blob = crypto
            .createHash('sha1')
            .update(Buffer.concat([Buffer.from('blob ' + bytes.length + '\0'), bytes]))
            .digest('hex');
        if (hash(bytes) !== row.sha256 || blob !== row.gitBlob) throw Error('PAL public source drift: ' + row.source);
        const original = bytes.toString('utf8');
        const header = original.match(/^\/\*[\s\S]*?\*\//);
        if (header && /Copyright/.test(header[0])) notices.push(row.source + '\n' + header[0]);
        let source = original;
        const replace = (before, after) => {
            source = replaceExactly(source, before, after, row.source);
        };
        if (
            /^pal\/input\/web\/(keyboard|mouse|touch)-input\.ts$/.test(row.source) ||
            row.source === 'pal/screen-adapter/web/screen-adapter.ts' ||
            /^pal\/audio\/web\/player-(dom|web)\.ts$/.test(row.source)
        ) {
            replace(
                "document.getElementById('GameCanvas')",
                "((globalThis as any).__CC_CANVAS__ || document.getElementById('GameCanvas'))",
            );
        }
        if (row.source === 'pal/env/web/env.ts') {
            replace(
                "document.querySelector('#GameCanvas')",
                "((globalThis as any).__CC_CANVAS__ || document.querySelector('#GameCanvas'))",
            );
        }
        if (row.source === 'pal/screen-adapter/web/screen-adapter.ts') {
            source = require('./screen-layout-patch.cjs').patchScreenLayout(source);
            replace(
                'return Math.min(window.devicePixelRatio ?? 1, 2);',
                'const cap = Number((window as any).__CCDPR_CAP__); return Math.min(window.devicePixelRatio ?? 1, Number.isFinite(cap) && cap > 0 ? cap : 2);',
            );
            replace('result.width *= dpr;', 'result.width = Math.round(result.width * dpr);');
            replace('result.height *= dpr;', 'result.height = Math.round(result.height * dpr);');
        }
        if (row.source === 'pal/input/web/touch-input.ts') {
            // Native touchcancel/scroll events can be non-cancelable. Preserve
            // touch retirement and dispatch without attempting an invalid cancel.
            replace('if (event.target === this._canvas) {', 'if (event.target === this._canvas && event.cancelable) {');
        }
        if (row.source === 'pal/input/web/mouse-input.ts') {
            // Mouseup now bubbles to the existing window listener; dispatch it only once.
            replace("        this._canvas?.addEventListener('mouseup', this._handleMouseUp);\n", '');
            // Let host DOM listeners observe mouse input; cancel only canvas defaults.
            source = replaceExactly(
                source,
                '            mouseEvent.stopPropagation();\n',
                '',
                row.source + ': mouse propagation',
            );
            source = replaceExactly(
                source,
                '        mouseEvent.stopPropagation();\n',
                '',
                row.source + ': wheel propagation',
            );
            source = replaceExactly(
                source,
                'if (mouseEvent.target === this._canvas) {',
                'if (mouseEvent.target === this._canvas && mouseEvent.cancelable) {',
                row.source + ': cancellation',
                2,
            );
        }
        source = patchStartupBinding(source, row.source);
        source = require('./audio-cancellation-patch.cjs').patchAudioCancellation(source, row.source);
        source = require('./audio-readiness-patch.cjs').patchAudioReadiness(source, row.source);
        source = require('./audio-playback-patch.cjs').patchAudioPlayback(source, row.source);
        const result = ts.transpileModule(source, {
            compilerOptions: {
                target: ts.ScriptTarget.ES2020,
                module: ts.ModuleKind.ES2020,
                newLine: ts.NewLineKind.LineFeed,
                removeComments: false,
                useDefineForClassFields: false,
            },
            fileName: row.source,
        });
        // ESM top-level this is undefined: the emitted decorator helper always
        // selects its local function. Preserve that behavior without the dead read.
        const esm = result.outputText.replace(
            'var __decorate = (this && this.__decorate) || function',
            'var __decorate = function',
        );
        outputs.set(
            row.output,
            original.includes('Permission is hereby granted') ? esm : '/*\n' + license.toString() + '\n*/\n' + esm,
        );
    }
    // Emit declarations from the frozen sources, including input value types.
    const tempBase = path.resolve(os.tmpdir());
    const temp = fs.mkdtempSync(path.join(tempBase, 'cocosair-pal-dts-'));
    try {
        for (const rel of ['pal/audio/type', 'pal/input/input-source']) {
            const file = path.join(temp, path.basename(rel) + '.ts');
            const declarationSource = fs.readFileSync(path.join(SOURCE, rel + '.ts'), 'utf8');
            fs.writeFileSync(
                file,
                require('./audio-readiness-patch.cjs').patchAudioReadiness(declarationSource, rel + '.ts'),
            );
            ts.createProgram([file, path.join(ROOT, 'src/@types/globals.d.ts')], {
                declaration: true,
                emitDeclarationOnly: true,
                noEmitOnError: false,
                types: [],
                skipLibCheck: true,
                newLine: ts.NewLineKind.LineFeed,
                target: ts.ScriptTarget.ES2020,
            }).emit(undefined, (name, text) => {
                if (name.endsWith(path.basename(rel) + '.d.ts')) {
                    const header = fs
                        .readFileSync(path.join(SOURCE, rel + '.ts'), 'utf8')
                        .match(/^\/\*[\s\S]*?\*\//)[0];
                    outputs.set('src/' + rel + '.d.ts', header + '\n' + text);
                }
            });
        }
    } finally {
        if (!path.resolve(temp).startsWith(tempBase + path.sep)) throw Error('Invalid PAL temp cleanup path');
        fs.rmSync(temp, { recursive: true, force: true });
    }
    if (!outputs.has('src/pal/audio/type.d.ts') || !outputs.has('src/pal/input/input-source.d.ts'))
        throw Error('PAL declaration emission failed');
    outputs.set('licenses/LICENSE_pal.txt', license);
    outputs.set(
        'licenses/NOTICE_pal.txt',
        'Cocos PAL public source notices\nCommit: ' + manifest.revision + '\n\n' + notices.join('\n\n') + '\n',
    );
    return { manifest, outputs };
}

function check() {
    const failures = [];
    try {
        const { outputs } = generate();
        for (const [file, bytes] of outputs) {
            const target = path.join(ROOT, file);
            if (!fs.existsSync(target) || !fs.readFileSync(target).equals(Buffer.from(bytes)))
                failures.push('PAL generated bytes/notice drift: ' + file);
        }
        const walk = (dir) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const file = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(file);
                else if (!outputs.has(path.relative(ROOT, file).replace(/\\/g, '/')))
                    failures.push('Unregistered PAL output: ' + file);
            }
        };
        walk(path.join(ROOT, 'src/pal'));
    } catch (error) {
        failures.push(error.message);
    }
    return failures;
}

if (require.main === module) {
    if (process.argv.includes('--write')) {
        const { outputs } = generate();
        for (const [file, bytes] of outputs) {
            const target = path.join(ROOT, file);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, bytes);
        }
    }
    const failures = check();
    console.log(JSON.stringify({ ok: failures.length === 0, failures }));
    process.exitCode = failures.length ? 1 : 0;
}
module.exports = { generate, check };
