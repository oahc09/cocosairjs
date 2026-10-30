/* U06 compatibility audit. Reads frozen tarballs and exact historical declarations.
 * Writes isolated consumers and evidence only; never regenerates SDK/product files.
 * Inventory coverageRequired is deliberately NOT a compatibility criterion.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const resolveAlias = (ts, checker, symbol) =>
    symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
const typeOnlyAlias = (ts, symbol) =>
    !!symbol.declarations?.some((d) => ts.isExportSpecifier(d) && (d.isTypeOnly || d.parent.parent.isTypeOnly));

function isAnyRegression(previous, current) {
    // Refining a wholly-any alias into a real callable is an improvement even if
    // that callable legitimately has an existing any-returning overload.
    return !previous?.any && (current.any || current.anyReturn > (previous?.anyReturn || 0));
}

function optionsFor(ts, mode) {
    return {
        strict: true,
        strictNullChecks: true,
        skipLibCheck: true,
        noEmit: true,
        target: ts.ScriptTarget.ES2020,
        module: mode === 'node16' ? ts.ModuleKind.Node16 : ts.ModuleKind.ESNext,
        moduleResolution:
            mode === 'bundler'
                ? ts.ModuleResolutionKind.Bundler
                : mode === 'node16'
                  ? ts.ModuleResolutionKind.Node16
                  : ts.ModuleResolutionKind.NodeJs,
        types: [],
        lib: ['lib.es2020.d.ts', 'lib.dom.d.ts'],
    };
}

function collectSurface(ts, file) {
    const program = ts.createProgram([file], optionsFor(ts, 'node'));
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(file);
    assert(source, 'Missing declaration source');
    const result = [];
    function visit(module, prefix = '', parents = new Set()) {
        if (parents.has(module)) return;
        const nextParents = new Set([...parents, module]);
        for (const exported of checker.getExportsOfModule(module)) {
            const symbol = resolveAlias(ts, checker, exported);
            const name = prefix + exported.name;
            if (
                symbol.declarations?.some((d) =>
                    d.modifiers?.some((m) =>
                        [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword].includes(m.kind),
                    ),
                )
            )
                continue;
            if (!/^[$\w]+(?:\.[$\w]+)*$/.test(name)) continue;
            const declaration = symbol.declarations?.find((d) => d.typeParameters?.length);
            const genericCount = declaration?.typeParameters?.length || 0;
            const type = !!(symbol.flags & ts.SymbolFlags.Type);
            const value = !!(symbol.flags & ts.SymbolFlags.Value) && !typeOnlyAlias(ts, exported);
            const members = [];
            const staticMembers = [];
            if (symbol.flags & ts.SymbolFlags.Class) {
                const valueType = checker.getTypeOfSymbolAtLocation(
                    symbol,
                    symbol.valueDeclaration || symbol.declarations[0],
                );
                for (const member of checker.getPropertiesOfType(valueType)) {
                    if (
                        member.name === 'prototype' ||
                        !/^[$\w]+$/.test(member.name) ||
                        member.declarations?.some((d) =>
                            d.modifiers?.some((m) =>
                                [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword].includes(m.kind),
                            ),
                        )
                    )
                        continue;
                    staticMembers.push(member.name);
                }
            }
            if (symbol.flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface)) {
                for (const member of checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol))) {
                    if (!/^[$\w]+$/.test(member.name)) continue;
                    if (
                        member.declarations?.some((d) =>
                            d.modifiers?.some((m) =>
                                [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword].includes(m.kind),
                            ),
                        )
                    )
                        continue;
                    members.push(member.name);
                }
            }
            result.push({
                name,
                type,
                value,
                typeOnly: typeOnlyAlias(ts, exported),
                genericCount,
                members,
                staticMembers,
            });
            if (symbol.flags & ts.SymbolFlags.Module) visit(symbol, name + '.', nextParents);
        }
    }
    visit(checker.getSymbolAtLocation(source));
    return result.sort((a, b) => a.name.localeCompare(b.name));
}

function makeProbes(surface) {
    const probes = [];
    for (const item of surface) {
        const typeName = 'SDK.' + item.name + (item.genericCount ? `<${Array(item.genericCount).fill('any')}>` : '');
        if (item.type) {
            probes.push({ id: 'type:' + item.name, expression: typeName });
            for (const member of item.members)
                probes.push({
                    id: 'member:' + item.name + '.' + member,
                    expression: `${typeName}[${JSON.stringify(member)}]`,
                });
        }
        // A typeof expression in an erased type-only import is itself legal type consumption.
        if (item.value) probes.push({ id: 'query:' + item.name, expression: 'typeof SDK.' + item.name });
    }
    return probes;
}

function makeStaticProbes(surface) {
    return surface.flatMap((item) =>
        (item.staticMembers || []).map((member) => ({
            id: 'static:' + item.name + '.' + member,
            expression: '(typeof SDK.' + item.name + ')[' + JSON.stringify(member) + ']',
        })),
    );
}

function compile(ts, directory, filename, code, mode, probes = []) {
    const file = path.join(directory, filename);
    fs.writeFileSync(file, code);
    const program = ts.createProgram([file], optionsFor(ts, mode));
    const diagnostics = ts.getPreEmitDiagnostics(program).map((d) => {
        const line =
            d.file && typeof d.start === 'number' ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : null;
        return {
            code: d.code,
            file: d.file ? path.relative(directory, d.file.fileName).split(path.sep).join('/') : null,
            line,
            probe: d.file?.fileName === file && line ? probes[line - 2]?.id || null : null,
            message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
        };
    });
    const installedDeclarations = program
        .getSourceFiles()
        .map((source) => path.relative(directory, source.fileName).split(path.sep).join('/'))
        .filter((name) => name.startsWith('node_modules/cocosair.js/') && name.endsWith('.d.ts'));
    const anyTypes = [];
    if (probes.length) {
        const checker = program.getTypeChecker();
        const source = program.getSourceFile(file);
        for (const statement of source.statements) {
            if (!ts.isTypeAliasDeclaration(statement)) continue;
            const index = Number(statement.name.text.replace(/^Probe/, ''));
            const probe = probes[index];
            if (!probe) continue;
            const type = checker.getTypeFromTypeNode(statement.type);
            const signatures = [
                ...checker.getSignaturesOfType(type, ts.SignatureKind.Call),
                ...checker.getSignaturesOfType(type, ts.SignatureKind.Construct),
            ];
            const any = !!(type.flags & ts.TypeFlags.Any);
            const anyReturn = signatures.filter(
                (signature) => checker.getReturnTypeOfSignature(signature).flags & ts.TypeFlags.Any,
            ).length;
            if (any || anyReturn) anyTypes.push({ probe: probe.id, any, anyReturn });
        }
    }
    return { status: diagnostics.length ? 'FAIL' : 'PASS', diagnostics, installedDeclarations, anyTypes };
}

function classifyRemoved(name, previous, currentSurface) {
    const root = name.split('.')[0];
    const typePathRetained = currentSurface.some(
        (entry) =>
            entry.name === name ||
            name === entry.name + '.constructor' ||
            ((name.startsWith(entry.name + '.') || name.startsWith(entry.name + '.prototype.')) &&
                [...(entry.members || []), ...(entry.staticMembers || [])].includes(name.split('.').at(-1))),
    );
    if (root === '__private')
        return typePathRetained
            ? 'generated-internal-type-retained-runtime-inventory-corrected'
            : 'generated-internal-namespace-with-type-consumption-break';
    if (
        [
            'CocosRenderer',
            'CocosSparkLayer',
            'PMREMGenerator',
            'sparkMath',
            'pmremLayout',
            'CUBEUV_SAMPLING_GLSL',
        ].includes(root)
    )
        return typePathRetained
            ? 'spark-main-type-retained-phantom-runtime-inventory-corrected'
            : 'spark-main-phantom-value-and-erased-type-consumption-break';
    if (['AirAssetError.constructor', 'QuatKeyframeValue.constructor', 'RealKeyframeValue.constructor'].includes(name))
        return 'phantom-constructor-corrected-type-preserved';
    if (currentSurface.some((entry) => entry.name === name && entry.value))
        return 'inventory-representation-loss-api-retained';
    return 'UNCLASSIFIED';
}

function runtimeExportNames(ts, file) {
    const ast = ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS,
    );
    const result = [];
    for (const node of ast.statements) {
        if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause))
            result.push(...node.exportClause.elements.map((element) => element.name.text));
    }
    assert(result.length, 'No explicit runtime export list found: ' + file);
    return [...new Set(result)].sort();
}

const retainedCaller = `import { RealCurve, QuatCurve, Node, MeshRenderer, Material, Vec3, utils, CCClass } from 'cocosair.js';
import type { RealKeyframeValue, QuatKeyframeValue, AirAssetError, Screen } from 'cocosair.js';
type IsAny<T> = 0 extends (1 & T) ? true : false;
type Assert<T extends true> = T;
type NotAny<T> = IsAny<T> extends true ? false : true;
const real = new RealCurve();
real.addKeyFrame(0, { value: 1 });
real.assignSorted([0, 1], [1, { value: 2 }]);
const realKey: RealKeyframeValue = real.getKeyframeValue(0);
const numberValue: number = realKey.value;
const quaternionKey: QuatKeyframeValue = new QuatCurve().getKeyframeValue(0);
const numberW: number = quaternionKey.value.w;
type RealKeyIsNotAny = Assert<NotAny<ReturnType<RealCurve['getKeyframeValue']>>>;
type QuatKeyIsNotAny = Assert<NotAny<ReturnType<QuatCurve['getKeyframeValue']>>>;
// @ts-expect-error retained private base must not resolve to any
real.getKeyframeValue(0).notAKeyframeMember;
// @ts-expect-error retained private parameter alias must reject non-keyframe objects
real.addKeyFrame(0, { notAKeyframeMember: true });
// @ts-expect-error numeric value remains typed
const wrongKeyValue: string = real.getKeyframeValue(0).value;
const node = new Node();
const ccClassResult: boolean = CCClass.isCCClassOrFastDefined(Node);
type CCClassFunctionIsNotAny = Assert<NotAny<typeof CCClass.isCCClassOrFastDefined>>;
// @ts-expect-error constructor argument must not widen through an unresolved self import
CCClass.isCCClassOrFastDefined(42);
const child: Node | null = utils.find('child', node);
const renderer = node.getComponent(MeshRenderer);
type RendererIsNotAny = Assert<NotAny<typeof renderer>>;
// @ts-expect-error generic constructor constraint must not accept a math class
node.addComponent(Vec3);
if (renderer) {
    const instance = renderer.getMaterialInstance(0);
    type InstanceIsNotAny = Assert<NotAny<typeof instance>>;
    if (instance) {
        const parent: Material = instance.parent;
        instance.setProperty('test', 1);
        renderer.setMaterialInstance(instance, 0);
        // @ts-expect-error private MaterialInstance must retain property typing
        const invalidParent: number = instance.parent;
        // @ts-expect-error non-existent inferred methods must not become any
        instance.notAMaterialMember();
        void parent;
    }
}
declare const error: AirAssetError;
const errorMessage: string = error.message;
type ErrorIsNotAny = Assert<NotAny<AirAssetError>>;
declare const screen: Screen;
type ScreenIsNotAny = Assert<NotAny<Screen>>;
void [numberValue, numberW, child, errorMessage, screen];
`;

const erasedSparkCaller = `import type { CocosRenderer, CocosSparkLayer, PMREMGenerator, sparkMath, pmremLayout, CUBEUV_SAMPLING_GLSL } from 'cocosair.js';
type IsAny<T> = 0 extends (1 & T) ? true : false;
type Assert<T extends false> = T;
declare const renderer: CocosRenderer;
declare const vector: sparkMath.Vector2;
const size: sparkMath.Vector2 = renderer.getSize(vector);
const width: number = size.x;
type VectorNotAny = Assert<IsAny<typeof size>>;
// @ts-expect-error generic output vector still requires a setter
renderer.getSize({});
// @ts-expect-error inferred component stays numeric
const wrong: string = size.x;
declare const layer: CocosSparkLayer;
const rendered: boolean = layer.render();
const disposed: void = layer.dispose();
type RendererNotAny = Assert<IsAny<CocosSparkLayer['renderer']>>;
// @ts-expect-error nested renderer retains methods
layer.renderer.notARendererMethod();
declare const pmrem: PMREMGenerator;
const pmremDisposed: void = pmrem.dispose();
declare const layout: typeof pmremLayout;
const widthFromPrivateInterface: number = layout(256).width;
// @ts-expect-error private return type stays precise
const invalidWidth: string = layout(256).width;
// @ts-expect-error function argument remains numeric
layout('256');
export type ShaderSource = typeof CUBEUV_SAMPLING_GLSL;
void [width, rendered, disposed, pmremDisposed, widthFromPrivateInterface];
`;

const standaloneCaller = `import { CocosRenderer, CocosSparkLayer, PMREMGenerator, sparkMath, pmremLayout } from './standalone/spark.module.js';
type IsAny<T> = 0 extends (1 & T) ? true : false;
type Assert<T extends false> = T;
declare const renderer: CocosRenderer;
const size: sparkMath.Vector2 = renderer.getSize(new sparkMath.Vector2(1, 2));
type VectorNotAny = Assert<IsAny<typeof size>>;
const width: number = size.x;
// @ts-expect-error vector member remains numeric
const wrong: string = size.x;
// @ts-expect-error generic output vector requires setter contract
renderer.getSize({});
declare const layer: CocosSparkLayer;
const result: boolean = layer.render();
const dispose: void = layer.dispose();
type LayerRendererNotAny = Assert<IsAny<CocosSparkLayer['renderer']>>;
// @ts-expect-error transitive renderer member must retain its declaration
layer.renderer.notARendererMethod();
declare const pmrem: PMREMGenerator;
const disposed: void = pmrem.dispose();
void [width, result, dispose, disposed, pmremLayout];
`;

function checkEntries({ root, directories, compilers, mainTree }) {
    const tree = JSON.parse(fs.readFileSync(mainTree, 'utf8')).tree;
    const sparkFiles = tree.filter((entry) => entry.path.startsWith('build/spark') && entry.path.endsWith('.d.ts'));
    assert(sparkFiles.length, 'Missing independently shipped Spark declarations');
    const provenance = sparkFiles.map((entry) => ({
        path: entry.path,
        expectedGitBlob: entry.sha,
        actualGitBlob: execFileSync('git', ['hash-object', path.join(root, entry.path)], { encoding: 'utf8' }).trim(),
    }));
    assert(
        provenance.every((entry) => entry.expectedGitBlob === entry.actualGitBlob),
        'Spark declarations changed; historical comparison requires separate original bytes',
    );
    const results = [],
        runtime = [];
    for (const [name, directory] of Object.entries(directories)) {
        const standalone = path.join(directory, 'standalone');
        fs.mkdirSync(standalone, { recursive: true });
        for (const entry of sparkFiles) {
            const target = path.join(standalone, entry.path.slice(6));
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.copyFileSync(path.join(root, entry.path), target);
        }
        fs.copyFileSync(
            path.join(directory, 'node_modules/cocosair.js/build/cocosair.module.d.ts'),
            path.join(standalone, 'cocosair.module.d.ts'),
        );
        const code = `const list=['cocosair.js','cocosair.js/math','cocosair.js/build/cocosair.module.js','cocosair.js/spark','cocosair.js/build/spark.module.js'];console.log(JSON.stringify(list.map(specifier=>{try{return {specifier,resolved:require.resolve(specifier)}}catch(e){return {specifier,error:e.code}}})));`;
        runtime.push({
            name,
            resolutions: JSON.parse(execFileSync(process.execPath, ['-e', code], { cwd: directory, encoding: 'utf8' })),
        });
        for (const [ts, modes] of compilers) {
            for (const mode of modes) {
                results.push({
                    name,
                    version: ts.version,
                    mode,
                    normal: compile(
                        ts,
                        directory,
                        'normal-entry.ts',
                        `import { Vec3, clamp01 } from 'cocosair.js/math';\nimport type { Node, AirAssetError, Screen, RealKeyframeValue, QuatKeyframeValue } from 'cocosair.js';\nconst length: number = new Vec3(1, 2, 3).length();\nconst clamp: number = clamp01(1);\nexport type Types = [Node, AirAssetError, Screen, RealKeyframeValue, QuatKeyframeValue];\nvoid [length, clamp];\n`,
                        mode,
                    ),
                    deep: compile(
                        ts,
                        directory,
                        'deep-entry.ts',
                        `import type { Node, CocosRenderer } from 'cocosair.js/build/cocosair.module.js';\nexport type Types = [Node, CocosRenderer];\n`,
                        mode,
                    ),
                    missingSpark: compile(
                        ts,
                        directory,
                        'missing-spark-entry.ts',
                        `import type { CocosRenderer } from 'cocosair.js/spark';\nexport type Renderer = CocosRenderer;\n`,
                        mode,
                    ),
                    standalone: compile(ts, directory, 'standalone-entry.ts', standaloneCaller, mode),
                });
                if (global.gc) global.gc();
            }
        }
    }
    return { provenance, runtime, results };
}

function installTarball(tarball, directory, cache) {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }) + '\n');
    const log = execFileSync(
        'npm',
        ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', '--cache=' + cache, tarball],
        { cwd: directory, encoding: 'utf8', timeout: 120000, maxBuffer: 8e6 },
    );
    fs.writeFileSync(path.join(directory, 'install.log'), log);
}

async function audit(args) {
    const root = path.resolve(args.root || path.join(__dirname, '../..'));
    const output = path.resolve(args.out || path.join(root, 'output/upstream-update/sdk-compatibility-audit'));
    const original = path.resolve(args['original-dts']);
    const baselineTarball = path.resolve(args['baseline-package']);
    const candidateTarball = path.resolve(args['candidate-package']);
    const modernPath = path.resolve(args['modern-ts']);
    const cache = path.resolve(args.cache);
    fs.mkdirSync(output, { recursive: true });
    const ts = require(path.join(path.dirname(modernPath), 'typescript.js'));
    assert.equal(ts.version, '5.9.3');
    const legacy = require(path.join(root, 'node_modules/typescript'));
    assert.equal(legacy.version, '4.9.5');
    const directories = Object.fromEntries(
        ['control', 'candidate', 'exact-original'].map((name) => [name, path.join(output, 'consumers', name)]),
    );
    installTarball(baselineTarball, directories.control, cache);
    installTarball(candidateTarball, directories.candidate, cache);
    fs.mkdirSync(directories['exact-original'], { recursive: true });
    fs.cpSync(directories.control, directories['exact-original'], { recursive: true });
    // This overlay is explicitly NOT advertised as a real historical npm package.
    // Runtime/package routing are fixed-main control; declaration bytes are exact main Git blob.
    fs.copyFileSync(
        original,
        path.join(directories['exact-original'], 'node_modules/cocosair.js/build/cocosair.module.d.ts'),
    );
    const dtsPath = (name) => path.join(directories[name], 'node_modules/cocosair.js/build/cocosair.module.d.ts');
    const originalSurface = collectSurface(ts, dtsPath('exact-original'));
    const candidateSurface = collectSurface(ts, dtsPath('candidate'));
    const probes = makeProbes(originalSurface);
    const staticProbes = makeStaticProbes(originalSurface);
    const staticProbeSource =
        `import type * as SDK from 'cocosair.js';\n` +
        staticProbes.map((p, i) => `export type Probe${i} = ${p.expression};`).join('\n') +
        '\n';
    fs.writeFileSync(path.join(output, 'static-probes.json'), JSON.stringify(staticProbes, null, 2) + '\n');
    const probeSource =
        `import type * as SDK from 'cocosair.js';\n` +
        probes.map((p, i) => `export type Probe${i} = ${p.expression};`).join('\n') +
        '\n';
    fs.writeFileSync(path.join(output, 'original-surface.json'), JSON.stringify(originalSurface, null, 2) + '\n');
    fs.writeFileSync(path.join(output, 'candidate-surface.json'), JSON.stringify(candidateSurface, null, 2) + '\n');
    fs.writeFileSync(path.join(output, 'probes.json'), JSON.stringify(probes, null, 2) + '\n');
    const baselineInventory = JSON.parse(fs.readFileSync(path.resolve(args['baseline-inventory']), 'utf8'));
    const candidateInventory = JSON.parse(
        fs.readFileSync(
            path.join(directories.candidate, 'node_modules/cocosair.js/docs/example-api-inventory.json'),
            'utf8',
        ),
    );
    const removed = Object.keys(baselineInventory.units)
        .filter((name) => !candidateInventory.units[name])
        .sort();
    const added = Object.keys(candidateInventory.units)
        .filter((name) => !baselineInventory.units[name])
        .sort();
    const removedRows = removed.map((name) => ({
        name,
        previous: baselineInventory.units[name],
        classification: classifyRemoved(name, baselineInventory.units[name], candidateSurface),
    }));
    const classificationCounts = Object.create(null);
    for (const row of removedRows)
        classificationCounts[row.classification] = (classificationCounts[row.classification] || 0) + 1;
    const runtime = {};
    for (const name of ['control', 'candidate'])
        runtime[name] = runtimeExportNames(
            ts,
            path.join(directories[name], 'node_modules/cocosair.js/build/npm/cocosair.module.js'),
        );
    const matrices = [];
    const compilers = [
        [legacy, ['node', 'node16']],
        [ts, ['node16', 'bundler']],
    ];
    for (const [compiler, modes] of compilers) {
        for (const mode of modes) {
            const matrix = {
                compiler: compiler.version,
                mode,
                strictNullChecks: true,
                skipLibCheck: true,
                variants: {},
            };
            for (const name of Object.keys(directories)) {
                matrix.variants[name] = {
                    surface: compile(compiler, directories[name], 'all-historical-types.ts', probeSource, mode, probes),
                    staticSurface: compile(
                        compiler,
                        directories[name],
                        'all-historical-statics.ts',
                        staticProbeSource,
                        mode,
                        staticProbes,
                    ),
                    retainedCaller: compile(compiler, directories[name], 'retained-caller.ts', retainedCaller, mode),
                    erasedSparkCaller: compile(
                        compiler,
                        directories[name],
                        'erased-spark-caller.ts',
                        erasedSparkCaller,
                        mode,
                    ),
                };
                if (global.gc) global.gc();
            }
            matrices.push(matrix);
            fs.writeFileSync(
                path.join(output, `matrix-${compiler.version}-${mode}.json`),
                JSON.stringify(matrix, null, 2) + '\n',
            );
            console.log(
                `[sdk-compatibility] ${compiler.version}/${mode}: ` +
                    Object.entries(matrix.variants)
                        .map(
                            ([name, r]) =>
                                `${name} surface=${r.surface.diagnostics.length}, retained=${r.retainedCaller.diagnostics.length}`,
                        )
                        .join('; '),
            );
        }
    }
    const entries = args['main-tree']
        ? checkEntries({ root, directories, compilers, mainTree: path.resolve(args['main-tree']) })
        : null;
    if (entries) fs.writeFileSync(path.join(output, 'entry-contracts.json'), JSON.stringify(entries, null, 2) + '\n');
    const comparisons = matrices.map((matrix) => {
        const previousInvalid = new Set(matrix.variants['exact-original'].surface.diagnostics.map((d) => d.probe));
        const controlInvalid = new Set(matrix.variants.control.surface.diagnostics.map((d) => d.probe));
        const candidateInvalid = matrix.variants.candidate.surface.diagnostics.filter(
            (d) => !previousInvalid.has(d.probe),
        );
        const originalAny = new Map(matrix.variants['exact-original'].surface.anyTypes.map((row) => [row.probe, row]));
        const candidateFailed = new Set(matrix.variants.candidate.surface.diagnostics.map((d) => d.probe));
        const newAny = matrix.variants.candidate.surface.anyTypes.filter(
            (row) =>
                !candidateFailed.has(row.probe) &&
                !previousInvalid.has(row.probe) &&
                isAnyRegression(originalAny.get(row.probe), row),
        );
        return {
            newAnyInPreviouslyPreciseTypes: newAny,
            compiler: matrix.compiler,
            mode: matrix.mode,
            originalInvalid: [...previousInvalid],
            mainRebuildOnlyDifferences: matrix.variants.control.surface.diagnostics.filter(
                (d) => !previousInvalid.has(d.probe),
            ),
            candidateHistoricalBreaks: candidateInvalid.length,
            candidateRegressionsAgainstRebuiltMain: candidateInvalid
                .filter((d) => !controlInvalid.has(d.probe))
                .map((d) => d.probe),
        };
    });
    const staticComparisons = matrices.map((matrix) => {
        const original = matrix.variants['exact-original'].staticSurface;
        const control = matrix.variants.control.staticSurface;
        const candidate = matrix.variants.candidate.staticSurface;
        const originalInvalid = new Set(original.diagnostics.map((d) => d.probe));
        const controlInvalid = new Set(control.diagnostics.map((d) => d.probe));
        const originalAny = new Map(original.anyTypes.map((row) => [row.probe, row]));
        const candidateInvalid = new Set(candidate.diagnostics.map((d) => d.probe));
        return {
            compiler: matrix.compiler,
            mode: matrix.mode,
            originalInvalid: [...originalInvalid],
            candidateHistoricalBreaks: candidate.diagnostics.filter((d) => !originalInvalid.has(d.probe)),
            introducedFailures: candidate.diagnostics.filter(
                (d) => !originalInvalid.has(d.probe) && !controlInvalid.has(d.probe),
            ),
            newAny: candidate.anyTypes.filter(
                (row) =>
                    !originalInvalid.has(row.probe) &&
                    !candidateInvalid.has(row.probe) &&
                    isAnyRegression(originalAny.get(row.probe), row),
            ),
        };
    });
    const introducedCallerFailures = matrices.flatMap((matrix) =>
        ['retainedCaller', 'erasedSparkCaller'].flatMap((kind) => {
            const baseline = new Set(
                matrix.variants['exact-original'][kind].diagnostics.map((d) =>
                    JSON.stringify([d.code, d.line, d.message]),
                ),
            );
            return matrix.variants.candidate[kind].diagnostics
                .filter((d) => !baseline.has(JSON.stringify([d.code, d.line, d.message])))
                .map((d) => ({ compiler: matrix.compiler, mode: matrix.mode, kind, ...d }));
        }),
    );
    const report = {
        schema: 'air-sdk-compatibility/1',
        status:
            staticComparisons.some(
                (row) => row.originalInvalid.length || row.introducedFailures.length || row.newAny.length,
            ) ||
            introducedCallerFailures.length ||
            classificationCounts.UNCLASSIFIED ||
            runtime.control.some((name) => !runtime.candidate.includes(name)) ||
            comparisons.some(
                (row) =>
                    row.originalInvalid.length ||
                    row.candidateRegressionsAgainstRebuiltMain.length ||
                    row.newAnyInPreviouslyPreciseTypes.length,
            )
                ? 'FAIL'
                : comparisons.some((row) => row.candidateHistoricalBreaks)
                  ? 'PASS_WITH_PREEXISTING_BASELINE_DIFFERENCES'
                  : 'PASS',
        scope: 'No newly introduced compatibility failures versus exact historical declarations and same-environment main control; retained historical rebuild differences are explicit.',
        introducedCallerFailures,
        inputs: {
            originalDeclaration: {
                sha256: sha(original),
                gitBlob: execFileSync('git', ['hash-object', original], { encoding: 'utf8' }).trim(),
            },
            baselineTarball: { sha256: sha(baselineTarball) },
            candidateTarball: { sha256: sha(candidateTarball) },
            declarationHashes: Object.fromEntries(Object.keys(directories).map((name) => [name, sha(dtsPath(name))])),
        },
        caveats: [
            'The original declaration overlay is exact Git bytes over fixed-main package routing, not a historical installed tarball.',
            'Runtime names are parsed from actual fixed tarball ESM export lists, not SSR execution or browser evidence.',
            'Inventory counts do not define the public type contract; coverageRequired never determines compatibility.',
            'Compiler probes verify all enumerated historical type names, type queries, and accessible class/interface member names; they are not an exhaustive proof of all possible overload calls.',
        ],
        inventory: {
            baseline: Object.keys(baselineInventory.units).length,
            candidate: Object.keys(candidateInventory.units).length,
            grossRemoved: removed.length,
            added: added.length,
            netRemoved: removed.length - added.length,
            baselineSourceFingerprint: baselineInventory.sourceFingerprint,
            candidateSourceFingerprint: candidateInventory.sourceFingerprint,
            originalDeclarationMatchesInventory: sha(original).startsWith(baselineInventory.sourceFingerprint),
            classificationCounts,
            removed: removedRows,
            addedNames: added,
        },
        runtime: {
            controlCount: runtime.control.length,
            candidateCount: runtime.candidate.length,
            missingFromCandidate: runtime.control.filter((name) => !runtime.candidate.includes(name)),
            phantomHistoricalRoots: [
                'AirAssetError',
                'QuatKeyframeValue',
                'RealKeyframeValue',
                'Screen',
                '__private',
                'CocosRenderer',
                'CocosSparkLayer',
                'PMREMGenerator',
                'sparkMath',
                'pmremLayout',
                'CUBEUV_SAMPLING_GLSL',
            ].map((name) => ({
                name,
                controlRuntime: runtime.control.includes(name),
                candidateRuntime: runtime.candidate.includes(name),
            })),
        },
        probeCount: probes.length,
        staticProbeCount: staticProbes.length,
        staticComparisons,
        comparisons,
        matrices,
    };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ output, classificationCounts, probeCount: probes.length, status: report.status }));
    return report;
}

module.exports = {
    audit,
    checkEntries,
    collectSurface,
    makeProbes,
    makeStaticProbes,
    compile,
    classifyRemoved,
    runtimeExportNames,
    retainedCaller,
    erasedSparkCaller,
    optionsFor,
    isAnyRegression,
};
if (require.main === module) {
    const args = Object.fromEntries(
        process.argv.slice(2).map((arg) => {
            const i = arg.indexOf('=');
            return [arg.slice(2, i), arg.slice(i + 1)];
        }),
    );
    audit(args)
        .then((report) => {
            if (!report.status.startsWith('PASS')) process.exitCode = 1;
        })
        .catch((error) => {
            console.error(error);
            process.exitCode = 1;
        });
}
