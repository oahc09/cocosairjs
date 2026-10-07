const fs = require('node:fs'),
    path = require('node:path'),
    assert = require('node:assert/strict'),
    crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
async function main() {
    const out = process.argv.find((v) => v.startsWith('--out='))?.slice(6);
    assert(out && !fs.existsSync(path.resolve(root, out)), '--out=<new.json> required');
    const npmCLI =
        process.env.AIR_NPM_CLI || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    assert(fs.existsSync(npmCLI), 'provide AIR_NPM_CLI for an existing npm installation');
    const directory = fs.mkdtempSync(path.join(root, 'output/pixi-capabilities/consumer-')),
        startedAt = new Date().toISOString();
    const assertions = [],
        failures = [];
    const hash = (file) =>
        crypto
            .createHash('sha256')
            .update(fs.readFileSync(path.join(root, file)))
            .digest('hex');
    const artifactFiles = [
        'build/cocosair.module.js',
        'build/cocosair.module.min.js',
        'build/cocosair.module.d.ts',
        'build/html-source.js',
        'build/html-source.d.ts',
        'package.json',
    ];
    const fingerprints = Object.fromEntries(artifactFiles.map((f) => [f, hash(f)]));
    const check = (name, action) => {
        try {
            action();
            assertions.push(name);
        } catch (error) {
            failures.push({
                name,
                error: String(error.stack || error),
                diagnostics: String(error.stdout || error.stderr || ''),
            });
        }
    };
    try {
        check('both runtime maps match the changed AIR and pipeline source', () => {
            const sources = [
                'dom-overlay.ts',
                'texture-sprite.ts',
                'graphics-commands.ts',
                'graphics-raster.ts',
                'ui-blend.ts',
                'effects/sprite-mask.ts',
            ].map((f) => 'src/air/' + f);
            sources.push('src/cocos/gfx/webgl2/webgl2-pipeline-state.ts');
            for (const bundle of ['build/cocosair.module.js', 'build/cocosair.module.min.js']) {
                const map = JSON.parse(fs.readFileSync(path.join(root, bundle + '.map')));
                for (const file of sources) {
                    const i = map.sources.findIndex(
                        (s) => path.resolve(path.dirname(path.join(root, bundle)), s) === path.join(root, file),
                    );
                    assert(i >= 0, file);
                    assert.equal(
                        map.sourcesContent[i].replace(/\r\n/g, '\n'),
                        fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'),
                        `${bundle}: stale ${file}`,
                    );
                }
            }
        });
        const npm = (args) =>
            execFileSync(process.execPath, [npmCLI, ...args, '--cache=' + path.join(directory, 'cache')], {
                cwd: root,
                encoding: 'utf8',
                maxBuffer: 8 * 1024 * 1024,
            });
        const packed = JSON.parse(npm(['pack', '--json', '--pack-destination=' + directory]))[0];
        check('tarball has HTML subpath, skills and manual; no source maps', () => {
            const files = packed.files.map((f) => f.path);
            for (const required of [
                'build/npm/html-source.js',
                'build/html-source.d.ts',
                'skills/air-code-first/SKILL.md',
                'skills/air-graphics-and-dom/SKILL.md',
                'skills/air-verification/SKILL.md',
                'docs/manual/graphics-and-dom.md',
            ])
                assert(files.includes(required), required);
            assert(!files.some((f) => /\.map$/.test(f)), 'no source maps');
        });
        const consumer = path.join(directory, 'project');
        fs.mkdirSync(consumer);
        fs.writeFileSync(
            path.join(consumer, 'package.json'),
            JSON.stringify({
                private: true,
                type: 'module',
                dependencies: { 'cocosair.js': 'file:' + path.join(directory, packed.filename) },
            }),
        );
        execFileSync(
            process.execPath,
            [
                npmCLI,
                'install',
                '--offline',
                '--ignore-scripts',
                '--no-audit',
                '--no-fund',
                '--cache=' + path.join(directory, 'cache'),
            ],
            { cwd: consumer, stdio: 'pipe' },
        );
        const installed = path.join(consumer, 'node_modules/cocosair.js');
        const html = await import(pathToFileURL(path.join(installed, 'build/npm/html-source.js')).href);
        check('installed HTML entry evaluates without document or eager engine', () => {
            assert.equal(typeof global.document, 'undefined');
            assert.equal(typeof html.createAirHTMLSource, 'function');
            assert.equal(typeof html.getAirHTMLSourceSupport, 'function');
        });
        fs.writeFileSync(
            path.join(consumer, 'probe.ts'),
            `import { createAirTextureSprite, createAirDOMOverlay, drawAirGraphics, airGraphicsCommandsToSvg, rasterizeAirGraphics, attachAirSpriteMask, createAirUIBlendScope, Texture2D, type AirGraphicsCommand } from 'cocosair.js';
import { createAirHTMLSource, type AirHTMLTextureTarget } from 'cocosair.js/html-source';
const texture: AirHTMLTextureTarget = new Texture2D();
const commands: AirGraphicsCommand[] = [{op:'circle',args:[0,0,10]},{op:'fill',paint:{color:'#ffffff'}}];
airGraphicsCommandsToSvg(commands,{x:0,y:0,width:20,height:20});
void [texture, createAirTextureSprite, createAirDOMOverlay, drawAirGraphics, rasterizeAirGraphics, attachAirSpriteMask, createAirUIBlendScope, createAirHTMLSource];`,
        );
        check('installed TS 4.9 node16 usage with repository skipLibCheck contract', () => {
            execFileSync(
                process.execPath,
                [
                    path.join(root, 'node_modules/typescript/bin/tsc'),
                    '--noEmit',
                    '--strict',
                    '--skipLibCheck',
                    '--target',
                    'ES2020',
                    '--module',
                    'Node16',
                    '--moduleResolution',
                    'Node16',
                    '--types',
                    'node',
                    'probe.ts',
                ],
                { cwd: consumer, stdio: 'pipe' },
            );
        });
        const runtime = require('esbuild').buildSync({
            stdin: {
                contents: `import {createAirTextureSprite,createAirDOMOverlay,drawAirGraphics,airGraphicsCommandsToSvg,rasterizeAirGraphics,attachAirSpriteMask,createAirUIBlendScope} from 'cocosair.js'; globalThis.__apis=[createAirTextureSprite,createAirDOMOverlay,drawAirGraphics,airGraphicsCommandsToSvg,rasterizeAirGraphics,attachAirSpriteMask,createAirUIBlendScope];`,
                resolveDir: consumer,
            },
            bundle: true,
            write: false,
            format: 'esm',
            platform: 'browser',
            target: 'es2022',
        });
        check('installed runtime exports resolve in a real consumer bundler', () =>
            assert(runtime.outputFiles[0].text.includes('__apis')),
        );
        for (const file of artifactFiles)
            if (hash(file) !== fingerprints[file]) failures.push({ name: 'artifact drift', file });
        const report = {
            schemaVersion: 'air-graphics-package/1',
            startedAt,
            endedAt: new Date().toISOString(),
            fingerprints,
            assertions,
            failures,
            passed: !failures.length,
        };
        fs.mkdirSync(path.dirname(path.resolve(root, out)), { recursive: true });
        fs.writeFileSync(path.resolve(root, out), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        console.log(JSON.stringify(report, null, 2));
        process.exitCode = report.passed ? 0 : 1;
    } finally {
        assert(
            path.resolve(directory).startsWith(path.join(root, 'output/pixi-capabilities/consumer-')),
            'cleanup must remain in the created consumer directory',
        );
        fs.rmSync(directory, { recursive: true, force: true });
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
