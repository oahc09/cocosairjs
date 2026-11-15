#!/usr/bin/env node
/* Installed CPU-only Shader preflight. Exit 0=passed, 1=failed, 2=unknown. */
const fs = require('node:fs');
const path = require('node:path');
(async () => {
    const args = process.argv.slice(2);
    if (args.includes('--help')) {
        console.log(
            'cocosair-shader-preflight <effect.json|-> [--collection] [--out=report.json]\nExit: 0=passed, 1=failed, 2=unknown. No GPU compilation.',
        );
        return;
    }
    const input = args.find((value) => !value.startsWith('--'));
    const unknown = args.filter(
        (value) => value.startsWith('--') && value !== '--collection' && !value.startsWith('--out='),
    );
    const output = args.find((value) => value.startsWith('--out='))?.slice(6);
    let report;
    try {
        if (!input || unknown.length) throw Error('Expected an input file and supported options; use --help');
        if (input !== '-' && fs.statSync(input).size > 8000000) throw Error('Input file exceeds 8 MB budget');
        const text = fs.readFileSync(input === '-' ? 0 : input, 'utf8');
        if (text.length > 8000000) throw Error('Input exceeds text budget');
        const value = JSON.parse(text);
        const { preflightEffect, preflightEffects } = await import('./shader-preflight.js');
        report = args.includes('--collection')
            ? preflightEffects(value.effects, value.references ?? [])
            : preflightEffect(value);
    } catch (error) {
        report = {
            schema: 'air-shader-preflight/1',
            analysisScope: 'compiled-json-identity-and-bounded-layout',
            status: 'failed',
            gpuValidated: false,
            diagnostics: [
                {
                    severity: 'error',
                    code: 'AIR_E_PREFLIGHT_INPUT',
                    path: input || '$',
                    effect: '',
                    shader: '',
                    message: String(error),
                },
            ],
            effects: [],
            references: [],
        };
    }
    const serialized = JSON.stringify(report, null, 2) + '\n';
    if (output) {
        const target = path.resolve(output);
        if (fs.existsSync(target)) throw Error('Choose a new report path; previous evidence is retained');
        fs.writeFileSync(target, serialized, { flag: 'wx' });
    }
    process.stdout.write(serialized);
    process.exitCode = report.status === 'failed' ? 1 : report.status === 'unknown' ? 2 : 0;
})().catch((error) => {
    console.error(String(error));
    process.exitCode = 1;
});
