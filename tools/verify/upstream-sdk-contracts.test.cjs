/* Pure U06 harness regressions. These synthetic packages are not candidate SDK evidence. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromiumOptions } = require('./upstream-sdk-browser-options.cjs');
const {
    PINNED_COMPILERS,
    loadCompiler,
    declaredValueExports,
    assertExportParity,
    checkTypes,
    checkMathBoundary,
} = require('./upstream-sdk-contracts.cjs');
const { vitePackage, html, serveInstalled } = require('./upstream-sdk-browser.cjs');
const root = path.resolve(__dirname, '../..');
const ts = require('typescript');
const declaration = `
export interface AirRequestPolicy {
    priority?: 'high' | 'low' | 'auto';
    httpCache?: RequestCache;
    credentials?: RequestCredentials;
    headers?: HeadersInit;
}
export interface GLTFLoaderOptions { request?: AirRequestPolicy; signal?: AbortSignal; }
export declare class Node {
    getChildByName(name: string): Node | null;
    getComponent(type: typeof MeshRenderer): MeshRenderer | null;
}
export declare class Material { setProperty(name: string, value: unknown): void; }
interface NativeMaterialInstance extends Material { readonly parent: Material; }
export declare class MeshRenderer {
    getMaterialInstance(index: number): NativeMaterialInstance | null;
    setMaterialInstance(value: Material | null, index: number): void;
}
export declare class AnimationClip { private brand: number; }
export interface GLTFInstance {
    readonly root: Node;
    readonly animations: readonly AnimationClip[];
    dispose(): void;
    setAnimationLoop(loop: boolean, clipName?: string): void;
}
export declare class GLTFAsset { instantiate(scene?: number): GLTFInstance; destroy(): boolean; }
export declare class GLTFLoader {
    constructor(options?: GLTFLoaderOptions);
    loadAsync(url: string): Promise<GLTFAsset>;
    parseAsync(data: string | ArrayBuffer, baseUrl?: string): Promise<GLTFAsset>;
    setMeshoptDecoder(value: null): this;
    setDRACODecoder(value: null): this;
    setKTX2Transcoder(value: null): this;
}
export declare function configureGLTFLoaderDefaults(options: GLTFLoaderOptions): void;
export declare function instantiate<T>(original: T): T;
export declare class Scene extends Node { private sceneBrand: number; }
export interface AirApp {
    getScene(): Scene | null;
    close?(): Promise<{ status: string }>;
    releaseScene?(): Promise<{ status: string }>;
}
export declare class GLTFError extends Error {
    readonly extension?: string;
    constructor(code: 'GLTF_DECODE_FAILED', message: string, extension?: string);
}
export declare class Vec3 { constructor(x?: number, y?: number, z?: number); length(): number; }
export declare class Mat4 { private matrixBrand: number; }
export declare function clamp01(value: number): number;
export { Material as MaterialAlias };
export type { TypeOnlyNative } from './type-only.js';
`;
const values = [
    'AnimationClip',
    'GLTFAsset',
    'GLTFError',
    'GLTFLoader',
    'Mat4',
    'Material',
    'MaterialAlias',
    'MeshRenderer',
    'Node',
    'Scene',
    'Vec3',
    'clamp01',
    'configureGLTFLoaderDefaults',
    'instantiate',
].sort();
function fixture() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'upstream-sdk-helper-test-'));
    const pkg = path.join(directory, 'node_modules/cocosair');
    fs.mkdirSync(path.join(pkg, 'build/npm'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}');
    fs.writeFileSync(
        path.join(pkg, 'package.json'),
        JSON.stringify({
            name: 'cocosair',
            type: 'module',
            types: './build/cocosair.module.d.ts',
            exports: {
                '.': {
                    'types@<5.0': './build/cocosair.legacy.d.ts',
                    types: './build/cocosair.module.d.ts',
                    import: './build/npm/cocosair.module.js',
                },
                './math': {
                    'types@<5.0': './build/cocosair.math.legacy.d.ts',
                    types: './build/cocosair.math.d.ts',
                    import: './build/npm/cocosair.math.js',
                },
            },
            typesVersions: {
                '<5.0': {
                    'build/cocosair.module.d.ts': ['build/cocosair.legacy.d.ts'],
                    math: ['build/cocosair.math.legacy.d.ts'],
                },
            },
        }),
    );
    fs.writeFileSync(path.join(pkg, 'build/type-only.d.ts'), 'export declare class TypeOnlyNative {}');
    for (const version of ['module', 'legacy'])
        fs.writeFileSync(path.join(pkg, `build/cocosair.${version}.d.ts`), declaration);
    for (const version of ['', '.legacy'])
        fs.writeFileSync(
            path.join(pkg, `build/cocosair.math${version}.d.ts`),
            `export { Vec3, Mat4, clamp01 } from './cocosair.${version ? 'legacy' : 'module'}';`,
        );
    fs.writeFileSync(
        path.join(pkg, 'build/npm/cocosair.math.js'),
        'export class Vec3 { constructor(x,y,z){this.x=x;this.y=y;this.z=z;} length(){return Math.hypot(this.x,this.y,this.z);} } export const clamp01 = value => Math.min(1,Math.max(0,value));',
    );
    return { directory, pkg, close: () => fs.rmSync(directory, { recursive: true, force: true }) };
}
function diagnostics(directory) {
    return ts.getPreEmitDiagnostics(
        ts.createProgram([path.join(directory, 'upstream-sdk-contracts.ts')], {
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.Node16,
            moduleResolution: ts.ModuleResolutionKind.Node16,
            types: [],
            lib: ['lib.es2020.d.ts', 'lib.dom.d.ts'],
        }),
    );
}

test('browser path uses exact override or Playwright default, never a Windows fallback', () => {
    assert.equal(chromiumOptions({}).executablePath, undefined);
    assert.equal(chromiumOptions({ AIR_CHROMIUM_PATH: process.execPath }).executablePath, process.execPath);
    assert(chromiumOptions({ AIR_CI_SOFTWARE_GL: '1' }).args.includes('--use-angle=swiftshader'));
    assert.throws(() => chromiumOptions({ AIR_CHROMIUM_PATH: 'relative-browser' }));
    assert.throws(() => chromiumOptions({ AIR_CHROMIUM_PATH: path.join(os.tmpdir(), 'missing-air-chromium') }));
    assert.throws(() => chromiumOptions({ AIR_CHROMIUM_PATH: os.tmpdir() }));
});

test('compiler and Vite version pins fail closed', () => {
    assert.equal(
        loadCompiler(path.join(root, 'node_modules/typescript/bin/tsc'), PINNED_COMPILERS.legacy).version,
        '4.9.5',
    );
    assert.throws(
        () => loadCompiler(path.join(root, 'node_modules/typescript/bin/tsc'), PINNED_COMPILERS.modern),
        /frozen version/,
    );
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'upstream-sdk-version-test-'));
    try {
        fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'vite', version: '7.1.13' }));
        assert.throws(() => vitePackage(directory), /frozen consumer version/);
        fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'vite', version: '7.1.12' }));
        assert.equal(vitePackage(directory).version, '7.1.12');
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('declaration/runtime parity includes aliases, excludes type-only interfaces, and rejects both drift directions', () => {
    assert.deepEqual(assertExportParity(['Class'], ['Class'], 'fixture').missingRuntime, []);
    assert.throws(() => assertExportParity(['Class', 'Lost'], ['Class'], 'missing runtime'));
    assert.throws(() => assertExportParity(['Class'], ['Class', 'Undeclared'], 'missing declaration'));
    const mock = fixture();
    try {
        fs.writeFileSync(path.join(mock.directory, 'probe.ts'), "import * as sdk from 'cocosair'; void sdk;\n");
        const program = ts.createProgram([path.join(mock.directory, 'probe.ts')], {
            moduleResolution: ts.ModuleResolutionKind.Node16,
            module: ts.ModuleKind.Node16,
        });
        assert.deepEqual(declaredValueExports(ts, program, 'cocosair', path.join(mock.directory, 'probe.ts')), values);
    } finally {
        mock.close();
    }
});

test('strict fixture accepts the declared contract and rejects widened request/lifecycle/null types', () => {
    const mock = fixture();
    try {
        const result = checkTypes({
            root,
            consumerDir: mock.directory,
            packageDir: mock.pkg,
            runtimeExports: values,
            mathExports: ['Mat4', 'Vec3', 'clamp01'],
            modernTsPath: process.env.AIR_UPSTREAM_MODERN_TS,
        });
        assert.equal(result.results.length, process.env.AIR_UPSTREAM_MODERN_TS ? 4 : 2);
        assert(result.results.every((entry) => entry.negativeCases >= 30 && entry.status === 'PASS'));
        if (process.env.AIR_UPSTREAM_MODERN_TS) assert.equal(result.modern, 'PASS');
        else assert.match(result.modern, /^NOT_RUN/);
        for (const [name, before, after] of [
            ['priority', "priority?: 'high' | 'low' | 'auto'", 'priority?: any'],
            ['HTTP cache', 'httpCache?: RequestCache', 'httpCache?: any'],
            ['credentials', 'credentials?: RequestCredentials', 'credentials?: any'],
            ['headers', 'headers?: HeadersInit', 'headers?: any'],
            ['request', 'request?: AirRequestPolicy', 'request?: any'],
            ['dispose return', 'dispose(): void', 'dispose(): any'],
            ['asset destroy return', 'destroy(): boolean', 'destroy(): any'],
            ['child nullability', 'getChildByName(name: string): Node | null', 'getChildByName(name: string): Node'],
            [
                'component nullability',
                'getComponent(type: typeof MeshRenderer): MeshRenderer | null',
                'getComponent(type: typeof MeshRenderer): MeshRenderer',
            ],
            [
                'material nullability',
                'getMaterialInstance(index: number): NativeMaterialInstance | null',
                'getMaterialInstance(index: number): NativeMaterialInstance',
            ],
        ]) {
            assert(declaration.includes(before), name);
            fs.writeFileSync(path.join(mock.pkg, 'build/cocosair.legacy.d.ts'), declaration.replace(before, after));
            const errors = diagnostics(mock.directory);
            assert(errors.length > 0, 'fixture failed to detect mutation: ' + name);
            assert(
                errors.some((entry) => entry.code === 2578 || entry.code === 2344),
                'negative/type-exact assertion did not trip: ' + name,
            );
        }
    } finally {
        mock.close();
    }
});

test('math boundary is a fresh no-DOM process and rejects global pollution', () => {
    const mock = fixture();
    try {
        assert.equal(checkMathBoundary(mock.directory).status, 'PASS');
        fs.appendFileSync(path.join(mock.pkg, 'build/npm/cocosair.math.js'), '\nglobalThis.window = {};');
        assert.throws(() => checkMathBoundary(mock.directory));
    } finally {
        mock.close();
    }
});

test('static browser server serves installed bytes without writing HTML into the package', async () => {
    const mock = fixture();
    let server;
    try {
        fs.writeFileSync(path.join(mock.pkg, 'build/npm/cocosair.module.js'), 'export const installed = true;');
        const before = fs.readdirSync(mock.pkg);
        server = await serveInstalled(mock.pkg, 'export const fixture = true;');
        const page = await fetch(server.origin + '/nested/');
        assert.match(await page.text(), /Content-Security-Policy/);
        assert.match(html('/installed/build/npm/cocosair.module.min.js', true), /cocosair\.module\.min\.js/);
        assert.equal(
            await (await fetch(server.origin + '/installed/build/npm/cocosair.module.js')).text(),
            'export const installed = true;',
        );
        assert.equal((await fetch(server.origin + '/installed/missing.js')).status, 404);
        assert.deepEqual(fs.readdirSync(mock.pkg), before);
        assert.equal(fs.existsSync(path.join(mock.pkg, 'index.html')), false);
    } finally {
        if (server) await server.close();
        mock.close();
    }
});
