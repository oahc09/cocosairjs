/* Rebuild AIR builtin effects from the frozen engine, using an explicitly configured build-only compiler.
 * --write: snapshot used MIT sources and write generated TS/manifest. --check: regenerate in memory.
 * --verify: check recorded input/output hashes only, without requiring the compiler or upstream checkout.
 * COCOS_EFFECT_COMPILER_ROOT=<cocos-cli root> node tools/build/builtin-assets.cjs --write|--check
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const vendor = path.join(root, 'vendor/builtin-source');
const manifestFile = path.join(vendor, 'manifest.json');
const revision = 'fffd9a514a';
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const read = (file) => fs.readFileSync(file, 'utf8');
const write = (file, bytes) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
};

function verify() {
    const manifest = JSON.parse(read(manifestFile));
    for (const [relative, hash] of Object.entries(manifest.inputs)) {
        if (sha(fs.readFileSync(path.join(vendor, relative))) !== hash)
            throw Error(`Builtin source drift: ${relative}`);
    }
    for (const [relative, hash] of Object.entries(manifest.outputs)) {
        if (sha(fs.readFileSync(path.join(root, relative))) !== hash)
            throw Error(`Generated builtin drift: ${relative}`);
    }
    return manifest;
}

function compileModule(source, filename, requireFrom) {
    const module = new Module(filename);
    module.filename = filename;
    module.paths = Module._nodeModulePaths(path.dirname(filename));
    module.require = requireFrom;
    module._compile(
        ts.transpileModule(source, {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
        }).outputText,
        filename,
    );
    return module.exports;
}

async function regenerate(mode) {
    const compilerRoot = process.env.COCOS_EFFECT_COMPILER_ROOT;
    if (!compilerRoot) throw Error('Set COCOS_EFFECT_COMPILER_ROOT to the existing build-only cocos-cli installation.');
    const upstream = process.env.COCOS_UPSTREAM || 'E:/AIProMax/github/cocos4';
    const temporary = fs.mkdtempSync(path.join(root, 'build/.tmp-builtin-source-'));
    const tree = path.join(temporary, 'tree');
    fs.mkdirSync(tree);
    execFileSync('git', [
        '-C',
        upstream,
        'archive',
        '--format=tar',
        '--output',
        path.join(temporary, 'source.tar'),
        revision,
        'editor/assets/effects',
        'editor/assets/chunks',
        'editor/exports/offline-mappings.ts',
        'cocos/rendering/define.ts',
        'cocos/rendering/custom',
        'cocos/core/memop',
        'cocos/core/algorithm/murmurhash2_gc.ts',
        'LICENSE',
    ]);
    execFileSync('tar', ['-xf', path.join(temporary, 'source.tar'), '-C', tree]);
    const inputs = {};
    const source = (relative) => {
        const bytes = fs.readFileSync(path.join(tree, relative));
        inputs[relative] = sha(bytes);
        if (mode === '--write') write(path.join(vendor, relative), bytes);
        return bytes.toString('utf8');
    };
    source('LICENSE');
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<canvas id="GameCanvas"></canvas>', { url: 'http://localhost/' });
    globalThis.window = dom.window;
    for (const key of [
        'document',
        'navigator',
        'location',
        'CustomEvent',
        'Event',
        'HTMLElement',
        'HTMLCanvasElement',
        'HTMLImageElement',
        'HTMLVideoElement',
        'MutationObserver',
        'getComputedStyle',
    ]) {
        if (dom.window[key] !== undefined)
            Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
    }
    dom.window.HTMLCanvasElement.prototype.getContext = () => null;
    dom.window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
    const sdkFile = path.join(root, 'build/cocosair.module.js');
    const runtime = await import(pathToFileURL(sdkFile).href);
    const enumsFile = 'cocos/rendering/define.ts';
    const enumsSource = source(enumsFile);
    const parsed = ts.createSourceFile(enumsFile, enumsSource, ts.ScriptTarget.Latest, true);
    const enumCode = parsed.statements
        .filter(
            (node) =>
                ts.isEnumDeclaration(node) &&
                ['RenderPassStage', 'RenderPriority', 'SetIndex'].includes(node.name.text),
        )
        .map((node) => node.getText(parsed))
        .join('\n');
    const enums = compileModule(enumCode, path.join(tree, enumsFile), () => {
        throw Error('Unexpected enum dependency');
    });
    const hashFile = 'cocos/core/algorithm/murmurhash2_gc.ts';
    const hashModule = compileModule(source(hashFile), path.join(tree, hashFile), () => {
        throw Error('Unexpected hash dependency');
    });
    const mappingsFile = 'editor/exports/offline-mappings.ts';
    const mappings = compileModule(source(mappingsFile), path.join(tree, mappingsFile), (specifier) => {
        if (specifier === '../../cocos/gfx') return runtime.gfx;
        if (specifier === '../../cocos/rendering/define') return enums;
        if (specifier === '../../cocos/core') return hashModule;
        throw Error(`Unexpected offline-mapping dependency: ${specifier}`);
    });
    const originalLoad = Module._load;
    const loaderConsoleError = console.error;
    let compiler;
    try {
        // The existing compiler captures console.error at module evaluation and checks throwOnWarning
        // even for errors. Bind an error-throwing sink before require so a failed include cannot ship.
        console.error = (...args) => {
            throw Error(args.map(String).join(' '));
        };
        Module._load = function (request, parent, isMain) {
            if (request === 'cc/editor/offline-mappings') return mappings;
            return originalLoad.call(this, request, parent, isMain);
        };
        compiler = require(path.join(compilerRoot, 'dist/core/assets/effect-compiler/index.js'));
    } finally {
        Module._load = originalLoad;
        console.error = loaderConsoleError;
    }
    compiler.options.noSource = true;
    compiler.options.skipParserTest = true; // Official build.js uses the same parser setting; GPU compilation remains an acceptance gate.
    compiler.options.throwOnError = true;
    const chunksByName = new Map();
    function indexChunks(relative) {
        for (const entry of fs.readdirSync(path.join(tree, relative), { withFileTypes: true })) {
            const child = relative + '/' + entry.name;
            if (entry.isDirectory()) indexChunks(child);
            else if (entry.name.endsWith('.chunk')) {
                const name = path.basename(entry.name, '.chunk');
                const candidates = chunksByName.get(name) || [];
                candidates.push(child);
                chunksByName.set(name, candidates);
            }
        }
    }
    indexChunks('editor/assets/chunks');
    let effectDirectory;
    compiler.options.chunkSearchFn = (names) => {
        for (const name of names) {
            for (const relative of [
                `editor/assets/chunks/${name}.chunk`,
                path.posix.join(effectDirectory, name + '.chunk'),
            ]) {
                if (fs.existsSync(path.join(tree, relative))) return { name, content: source(relative) };
            }
        }
        for (const name of names) {
            const candidates = chunksByName.get(name);
            if (candidates?.length > 1) throw Error(`Ambiguous frozen chunk: ${name}`);
            if (candidates?.length === 1) return { name, content: source(candidates[0]) };
        }
        return {};
    };
    const input = JSON.parse(read(manifestFile));
    // Keep the registered pipeline/utility names shipped before the frozen-source rebuild.
    // These are runtime assets too: Profiler.showStats() resolves util/profiler by name.
    const retainedEffects = {
        'pipeline/bloom': 'editor/assets/effects/pipeline/post-process/bloom.effect',
        'pipeline/deferred-lighting': 'editor/assets/effects/pipeline/deferred-lighting.effect',
        'pipeline/planar-shadow': 'editor/assets/effects/pipeline/planar-shadow.effect',
        'pipeline/post-process': 'editor/assets/effects/pipeline/post-process.effect',
        'pipeline/skybox': 'editor/assets/effects/pipeline/skybox.effect',
        'util/profiler': 'editor/assets/effects/util/profiler.effect',
        'util/splash-screen': 'editor/assets/effects/util/splash-screen.effect',
        // AIR's existing glTF extension hooks target the official legacy shading model.
        // Keep that model frozen too, with the same current runtime uniform ABI.
        'air-gltf-template': 'editor/assets/effects/legacy/standard.effect',
    };
    for (const [name, relative] of Object.entries(retainedEffects)) {
        if (!input.effects.includes(name)) input.effects.push(name);
        input.effectPaths[name] = relative;
    }
    const effects = [];
    const customEffects = [];
    const originalError = console.error;
    try {
        console.error = (...args) => {
            throw Error(args.map(String).join(' '));
        };
        for (const effectName of input.effects) {
            const relative = input.effectPaths[effectName];
            effectDirectory = path.posix.dirname(relative);
            const effect = compiler.buildEffect(effectName, source(relative));
            if (!effect?.shaders?.length) throw Error(`No compiled shaders: ${effectName}`);
            effects.push(effect);
        }
        for (const name of [
            'float-output-process',
            'post-process/blit-screen',
            'post-process/bloom',
            'post-process/color-grading',
            'post-process/fxaa-hq',
            'post-process/post-final',
            'post-process/taa',
            'post-process/hbao',
            'post-process/dof',
            'post-process/fsr',
        ]) {
            effectDirectory = path.posix.dirname(`editor/assets/effects/pipeline/${name}.effect`);
            const effect = compiler.buildEffect(
                `pipeline/${name}`,
                source(`editor/assets/effects/pipeline/${name}.effect`),
            );
            if (!effect?.shaders?.length) throw Error(`No compiled custom shaders: ${name}`);
            customEffects.push(effect);
        }
    } finally {
        console.error = originalError;
    }
    // Use the frozen graph builder and archive implementation. SDK classes are actual engine classes;
    // no editor/native runtime, handwritten descriptor table or browser shader wrapper is substituted.
    const frozenModules = new Map();
    const loadFrozen = (relative) => {
        if (frozenModules.has(relative)) return frozenModules.get(relative);
        const filename = path.join(tree, relative);
        const value = compileModule(source(relative), filename, (specifier) => {
            if (specifier === 'internal:constants') return { COCOS_RUNTIME: false, HTML5: true };
            const target = path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier));
            if (target === 'cocos/gfx') return runtime.gfx;
            if (target === 'cocos/core') return { ...runtime, cclegacy: dom.window.cc };
            if (target === 'cocos/core/memop') return { RecyclePool: runtime.memop.RecyclePool };
            if (target === 'cocos/scene-graph/layers') return { Layers: runtime.Layers };
            if (target.startsWith('cocos/rendering/custom/') || target === 'cocos/rendering/define')
                return loadFrozen(target + '.ts');
            if (target.startsWith('cocos/render-scene/')) return runtime;
            throw Error(`Unexpected graph dependency: ${relative}: ${specifier}`);
        });
        frozenModules.set(relative, value);
        return value;
    };
    const graph = loadFrozen('cocos/rendering/custom/layout-graph.ts');
    const editor = loadFrozen('cocos/rendering/custom/layout-graph-editor.ts');
    const archive = loadFrozen('cocos/rendering/custom/binary-archive.ts');
    const allEffects = [...effects, ...customEffects];
    const visibility = new editor.VisibilityGraph();
    for (const effect of allEffects) visibility.mergeEffect(effect);
    const info = new editor.LayoutGraphInfo(visibility);
    for (const effect of allEffects) info.addEffect(effect);
    if (info.build()) throw Error('Frozen custom layout build failed');
    const layout = new graph.LayoutGraphData();
    editor.buildLayoutGraphData(info.lg, layout);
    const binary = new archive.BinaryOutputArchive();
    graph.saveLayoutGraphData(binary, layout);
    const compressed = require('zlib').deflateSync(Buffer.from(binary.data));
    const layoutBytes = Buffer.alloc(8 + compressed.length);
    // Runtime reads the header in network byte order.
    layoutBytes.writeUInt32BE(0xffffffff, 0);
    layoutBytes.writeUInt32BE(editor.getLayoutGraphDataVersion(), 4);
    compressed.copy(layoutBytes, 8);
    const glsl4 = effects.map((effect) => effect.shaders.map((shader) => shader.glsl4));
    for (const effect of effects) compiler.stripEditorSupport(effect, { glsl1: false, glsl3: false, glsl4: false });
    const banner = read(path.join(root, 'src/air/app.ts')).split('*/')[0] + '*/\n';
    const outputs = {
        'src/air/builtin/builtin-effects.ts':
            banner +
            '// Generated by tools/build/builtin-assets.cjs from frozen MIT engine sources.\nexport const effects = ' +
            JSON.stringify(effects, null, 2) +
            ';\n',
        'src/air/builtin/builtin-glsl4.ts':
            banner +
            '// Generated by tools/build/builtin-assets.cjs from frozen MIT engine sources.\nexport const glsl4 = ' +
            JSON.stringify(glsl4, null, 2) +
            ';\n',
        'vendor/builtin-source/generated/custom-effects.json': JSON.stringify(customEffects, null, 2) + '\n',
        'vendor/builtin-source/generated/custom-layout.bin': layoutBytes,
    };
    const copyrights = new Set();
    for (const relative of Object.keys(inputs)) {
        for (const line of read(path.join(tree, relative)).split(/\r?\n/)) {
            if (/copyright.*(?:\(c\)|©)/i.test(line)) copyrights.add(line.trim());
        }
    }
    outputs['licenses/LICENSE_builtin_source.txt'] =
        Array.from(copyrights).sort().join('\n') + '\n\n' + source('LICENSE');
    const compilerFiles = ['index.js', 'shdc-lib.js', 'offline-mappings.js', 'utils.js'];
    const compilerHashes = Object.fromEntries(
        compilerFiles.map((name) => [
            name,
            sha(fs.readFileSync(path.join(compilerRoot, 'dist/core/assets/effect-compiler', name))),
        ]),
    );
    const result = {
        ...input,
        revision,
        inputs,
        outputs: Object.fromEntries(Object.entries(outputs).map(([file, text]) => [file, sha(text)])),
        compiler: {
            name: 'cocos-cli',
            version: JSON.parse(read(path.join(compilerRoot, 'package.json'))).version,
            files: compilerHashes,
            note: 'Existing local build tool; version and hashes do not certify an official release. Compiler code is not shipped.',
        },
    };
    if (mode === '--write') {
        for (const [file, text] of Object.entries(outputs)) write(path.join(root, file), text);
        write(manifestFile, JSON.stringify(result, null, 2) + '\n');
    } else {
        for (const [file, bytes] of Object.entries(outputs))
            if (!fs.readFileSync(path.join(root, file)).equals(Buffer.from(bytes)))
                throw Error(`Builtin regeneration drift: ${file}`);
        if (JSON.stringify(result) !== JSON.stringify(input)) throw Error('Builtin compiler/input provenance drift');
    }
    dom.window.close();
    const checkedTemporary = path.resolve(temporary);
    if (
        !checkedTemporary.startsWith(path.resolve(root, 'build') + path.sep) ||
        !path.basename(checkedTemporary).startsWith('.tmp-builtin-source-')
    ) {
        throw Error('Unexpected builtin scratch path');
    }
    fs.rmSync(checkedTemporary, { recursive: true, force: true });
    console.log(
        `Builtin assets ${mode}: ${effects.length} effects, ${glsl4.flat().length} shaders, ${Object.keys(inputs).length} frozen inputs`,
    );
}

module.exports = { verify };
if (require.main === module) {
    const mode = process.argv[2];
    if (mode === '--verify') {
        verify();
        console.log('Builtin source/output hashes: PASS');
    } else if (mode === '--write' || mode === '--check')
        regenerate(mode).catch((error) => {
            console.error(error);
            process.exitCode = 1;
        });
    else throw Error('Usage: node tools/build/builtin-assets.cjs --write|--check|--verify');
}
