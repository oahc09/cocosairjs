'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const tsPath = require.resolve('typescript', { paths: [path.join(__dirname, '../box3d-rebuild-20261022')] });
const ts = require(tsPath);
const root = '/virtual-material-entry';
const paths = {
    asset: `${root}/src/cocos/physics/framework/assets/physics-material.ts`,
    bridge: `${root}/src/cocos/physics/framework/physics-material-values.ts`,
    primitive: `${root}/src/cocos/physics/framework/physics-material-values-transaction.ts`,
    guard: `${root}/src/cocos/core/data/mutation-guard.ts`,
    assetBase: `${root}/src/cocos/asset/assets/asset.d.ts`,
    core: `${root}/src/cocos/core/index.d.ts`,
    decorators: `${root}/decorators.d.ts`,
};
const files = {
    [paths.asset]: fs.readFileSync(
        path.join(__dirname, 'src/cocos/physics/framework/assets/physics-material.ts'),
        'utf8',
    ),
    [paths.bridge]: fs.readFileSync(
        path.join(__dirname, 'src/cocos/physics/framework/physics-material-values.ts'),
        'utf8',
    ),
    [paths.primitive]: fs.readFileSync(
        path.join(__dirname, 'inputs/s1/physics-material-values-transaction.ts'),
        'utf8',
    ),
    [paths.guard]: fs.readFileSync(
        path.join(__dirname, 'inputs/product/src/cocos/core/data/mutation-guard.ts'),
        'utf8',
    ),
    [paths.assetBase]: 'export declare class Asset { _uuid: string; emit(type: string): void; destroy(): boolean; }',
    [paths.core]:
        'export declare const CCFloat: NumberConstructor; export declare const math: { equals(a: number, b: number): boolean };',
    [paths.decorators]: 'export declare const ccclass: any, editable: any, range: any, serializable: any, type: any;',
};
const options = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    experimentalDecorators: true,
    skipLibCheck: false,
    types: [],
    moduleResolution: ts.ModuleResolutionKind.Node10,
};
const host = ts.createCompilerHost(options);
const originalRead = host.readFile.bind(host),
    originalExists = host.fileExists.bind(host);
const readInputs = new Map();
host.readFile = (p) => {
    const text = files[p] === undefined ? originalRead(p) : files[p];
    if (text !== undefined) readInputs.set(p, crypto.createHash('sha256').update(text).digest('hex'));
    return text;
};
host.fileExists = (p) => files[p] !== undefined || originalExists(p);
host.getSourceFile = (p, lang, onError) => {
    const text = host.readFile(p);
    return text === undefined ? undefined : ts.createSourceFile(p, text, lang, true);
};
host.resolveModuleNames = (names, containing) =>
    names.map((name) => {
        let resolved;
        if (name === 'cc.decorator') resolved = paths.decorators;
        else if (name.endsWith('/physics-material-values-transaction')) resolved = paths.primitive;
        else if (name.endsWith('/physics-material-values')) resolved = paths.bridge;
        else if (name.endsWith('/mutation-guard')) resolved = paths.guard;
        else if (name.endsWith('/asset')) resolved = paths.assetBase;
        else if (name.endsWith('/core')) resolved = paths.core;
        else throw new Error(`Unexpected import ${name} in ${containing}`);
        return {
            resolvedFileName: resolved,
            extension: resolved.endsWith('.d.ts') ? ts.Extension.Dts : ts.Extension.Ts,
        };
    });
const program = ts.createProgram([paths.asset, paths.bridge, paths.primitive, paths.guard], options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
const formatted = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => __dirname,
    getCanonicalFileName: (p) => p,
    getNewLine: () => '\n',
});
const output = {
    schema: 'material-value-entry-typecheck/1',
    scope: 'Strict candidate and S1/guard typecheck against minimal controlled engine declarations, not full SDK',
    typescript: ts.version,
    compiler: { path: tsPath, sha256: crypto.createHash('sha256').update(fs.readFileSync(tsPath)).digest('hex') },
    diagnostics: diagnostics.map((d) => ({
        file: d.file?.fileName,
        start: d.start,
        code: d.code,
        message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
    })),
    virtualDeclarations: Object.fromEntries(Object.entries(files).filter(([p]) => p.endsWith('.d.ts'))),
    inputs: [...readInputs].map(([p, sha256]) => ({ path: p, sha256 })),
};
const dir = path.join(__dirname, process.argv[2] || 'evidence/typecheck-a');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(output, null, 2) + '\n');
console.log(formatted || `Strict narrow typecheck PASS (${readInputs.size} input files).`);
process.exitCode = diagnostics.length ? 1 : 0;
