/* Real tarball consumer for the optional CPU-only entry. Main/Spark runtime acceptance is separate. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const ts = require('typescript');
const { buildShaderPreflight } = require('../build/shader-preflight.cjs');
const root = path.resolve(__dirname, '../..');
const arg = process.argv.find((value) => value.startsWith('--out='));
assert(arg, '--out=<new directory> required');
const out = path.resolve(root, arg.slice(6));
assert(out.startsWith(root + path.sep) && !fs.existsSync(out), 'Use a new workspace output directory');
fs.mkdirSync(out, { recursive: true });
const report = {
    completed: false,
    subset: true,
    scope: 'actual npm tarball CPU preflight entry/CLI/types only; main runtime not accepted',
    checks: [],
};
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
(async () => {
    try {
        const build = path.join(root, 'build'),
            publish = path.join(build, 'npm');
        for (const file of ['cocosair.module.js', 'cocosair.module.min.js'])
            assert(
                fs.existsSync(path.join(publish, file)),
                'Existing runtime publish copies are required; this tool will not rebuild them',
            );
        const retained = Object.fromEntries(
            ['cocosair.module.js', 'cocosair.module.min.js'].map((file) => [file, hash(path.join(publish, file))]),
        );
        report.preflightBuild = await buildShaderPreflight(root, build);
        for (const file of ['shader-preflight.js', 'shader-preflight-cli.cjs'])
            fs.copyFileSync(path.join(build, file), path.join(publish, file));
        const npmCLI =
            process.env.AIR_NPM_CLI || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
        assert(fs.existsSync(npmCLI), 'Provide AIR_NPM_CLI for the current npm installation');
        const npm = (args, cwd) =>
            execFileSync(process.execPath, [npmCLI, ...args], {
                cwd,
                encoding: 'utf8',
                timeout: 120000,
                maxBuffer: 16 * 1024 * 1024,
            });
        const packedText = npm(['pack', '--ignore-scripts', '--json', '--pack-destination=' + out], root);
        fs.writeFileSync(path.join(out, 'pack.json'), packedText);
        const packed = JSON.parse(packedText)[0];
        report.tarball = { filename: packed.filename, sha256: hash(path.join(out, packed.filename)) };
        const consumer = path.join(out, 'consumer');
        fs.mkdirSync(consumer);
        fs.writeFileSync(path.join(consumer, 'package.json'), '{"private":true,"type":"module"}\n');
        fs.writeFileSync(
            path.join(out, 'install.log'),
            npm(
                [
                    'install',
                    '--offline',
                    '--ignore-scripts',
                    '--no-audit',
                    '--no-fund',
                    path.join(out, packed.filename),
                ],
                consumer,
            ),
        );
        const installed = path.join(consumer, 'node_modules/cocosair.js');
        const manifest = JSON.parse(fs.readFileSync(path.join(installed, 'package.json')));
        assert(fs.existsSync(path.join(installed, manifest.bin['cocosair-shader-preflight'])));
        const code = `import assert from 'node:assert/strict';\nassert.equal(typeof globalThis.window,'undefined');\nconst api=await import('cocosair.js/shader-preflight');\nassert.equal(typeof api.preflightEffect,'function');\nassert.equal(typeof globalThis.window,'undefined');assert.equal(globalThis.cc,undefined);\nconst result=api.preflightEffect(JSON.parse((await import('node:fs')).readFileSync(process.argv[2],'utf8')));\nassert.equal(result.status,'passed');console.log(JSON.stringify({status:result.status,gpuValidated:result.gpuValidated}));\n`;
        const source = path.join(consumer, 'consumer.mjs');
        fs.writeFileSync(source, code);
        const input = path.join(root, 'skills/cocosair-materials-effects/references/minimal-effect.json');
        fs.writeFileSync(
            path.join(out, 'node-consumer.log'),
            execFileSync(process.execPath, [source, input], { cwd: consumer, encoding: 'utf8' }),
        );
        report.checks.push('installed-public-subpath-import-without-DOM-or-engine-init');
        const typed = path.join(consumer, 'consumer.ts');
        fs.writeFileSync(
            typed,
            `import {preflightEffect,preflightEffects,AirShaderPreflightReport} from 'cocosair.js/shader-preflight';\nconst result:AirShaderPreflightReport=preflightEffect({});\nconst batch=preflightEffects([], [{effectIndex:0}]);\nconst checked:false=result.gpuValidated;\n// @ts-expect-error the tool does not export engine Node\nimport {Node} from 'cocosair.js/shader-preflight';\n// @ts-expect-error status is not a GPU success certificate\nconst success:'gpu-passed'=result.status;\n`,
        );
        const program = ts.createProgram([typed], {
            noEmit: true,
            strict: true,
            types: [],
            lib: ['lib.es2020.d.ts'],
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.Node16,
            moduleResolution: ts.ModuleResolutionKind.Node16,
        });
        const diagnostics = ts.getPreEmitDiagnostics(program);
        assert.equal(
            diagnostics.length,
            0,
            ts.formatDiagnosticsWithColorAndContext(diagnostics, {
                getCanonicalFileName: (file) => file,
                getCurrentDirectory: () => consumer,
                getNewLine: () => '\n',
            }),
        );
        report.checks.push('installed-types-without-lib-dom-and-negative-imports');
        const installedCLI = path.join(installed, manifest.bin['cocosair-shader-preflight']);
        const cli = spawnSync(process.execPath, [installedCLI, input], { encoding: 'utf8', cwd: consumer });
        fs.writeFileSync(path.join(out, 'cli.log'), cli.stdout + cli.stderr);
        assert.equal(cli.status, 0, cli.stderr);
        assert.equal(JSON.parse(cli.stdout).status, 'passed');
        report.checks.push('installed-bin-runs-real-json-input');
        for (const [file, expected] of Object.entries(retained))
            assert.equal(hash(path.join(publish, file)), expected, 'Main publication copies must not be rewritten');
        report.completed = true;
    } catch (error) {
        report.failure = String(error.stack || error);
        report.stdout = String(error.stdout || '');
        report.stderr = String(error.stderr || '');
        process.exitCode = 1;
    } finally {
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify(report));
    }
})();
