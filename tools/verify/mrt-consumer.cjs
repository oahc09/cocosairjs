/* Compile a direct-file SDK consumer from the generated main declarations. No npm pack or runtime rebuild. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const args = Object.fromEntries(process.argv.slice(2).map((value) => value.replace(/^--/, '').split('=')));
assert(args.out, '--out=<new directory> required');
const out = path.resolve(root, args.out);
assert(out.startsWith(root + path.sep) && !fs.existsSync(out), 'Use a new workspace output directory');
fs.mkdirSync(out, { recursive: true });
const declaration = path.join(root, 'build/cocosair.module.d.ts');
const source = path.join(out, 'consumer.ts');
fs.writeFileSync(
    source,
    `
import { createAirMRTTarget, AirMRTOptions, AirMRTInfo, Material, director, gfx } from 'cocosair.js';
declare const material: Material;
const options: AirMRTOptions = {
    width: 64, height: 32, samples: 4, sampleFallback: 'lower', depthFormat: gfx.Format.DEPTH_STENCIL,
    colorAttachments: [{ format: gfx.Format.RGBA16F, clearValue: [0, 0, 0, 1] }],
};
const target = createAirMRTTarget(options);
const info: AirMRTInfo = target.info;
const texture: gfx.Texture = target.textures[0];
const command = director.root!.device.createCommandBuffer(new gfx.CommandBufferInfo(director.root!.device.queue));
command.begin(); target.beginPass(command, { clear: false }); target.endPass(command); command.end();
const unbind: () => void = target.bindTexture(material, 'mainTexture');
target.resize(128, 64); unbind(); target.dispose();
// @ts-expect-error named strings are not native Format enums
const invalid: AirMRTOptions = { width: 1, height: 1, colorAttachments: [{ format: 'rgba16f' }] };
// @ts-expect-error only supported request sample counts are admitted
const samples: AirMRTOptions = { width: 1, height: 1, samples: 3, colorAttachments: [{ format: gfx.Format.RGBA8 }] };
`,
);
const program = ts.createProgram([source], {
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    baseUrl: root,
    paths: { 'cocosair.js': [declaration] },
});
const diagnostics = ts.getPreEmitDiagnostics(program);
const report = {
    completed: diagnostics.length === 0,
    subset: true,
    scope: 'generated main declaration direct-file consumer; not installed-package acceptance',
    typescript: ts.version,
    declarationSHA256: crypto.createHash('sha256').update(fs.readFileSync(declaration)).digest('hex'),
    diagnostics: ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCurrentDirectory: () => root,
        getCanonicalFileName: (file) => file,
        getNewLine: () => '\n',
    }),
};
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
if (!report.completed) process.exitCode = 1;
