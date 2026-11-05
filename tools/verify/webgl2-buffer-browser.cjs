/*
 * Native WebKit WebGL2 checks for Buffer byte ranges and UBO bindings.
 * Explicit setup only; never installs browsers, modifies runtime builds, or uses
 * build/ bundles. Missing dependencies, browser, or WebGL2 are BLOCKED (exit 1).
 * Writes only a new --out report, preserving all earlier attempts.
 *
 * AIR_WEBKIT_EXECUTABLE=<installed-webkit-launcher> NODE_PATH=<tooling-node_modules> \
 *   node tools/verify/webgl2-buffer-browser.cjs --out=output/buffer-candidate.json
 * The selected launcher must configure all browser runtime dependencies. The
 * command above is a configuration template, not a portable installation recipe.
 * In particular, some official MiniBrowser wrappers replace LD_LIBRARY_PATH;
 * setting it outside such a wrapper does not make external libraries visible.
 * For an already-installed Linux WPE bundle with separately provisioned libraries,
 * invoke its actual executable with the complete environment instead:
 *   WK=<installed-webkit-bundle>/minibrowser-wpe
 *   EXTRA_LIBS=<installed-extra-shared-library-directory>
 *   WEBKIT_EXEC_PATH="$WK/bin" WEBKIT_INJECTED_BUNDLE_PATH="$WK/lib" \
 *   WEBKIT_INSPECTOR_RESOURCES_PATH="$WK/share" WEBKIT_FORCE_COMPLEX_TEXT=1 \
 *   LD_LIBRARY_PATH="$EXTRA_LIBS:$WK/lib:$WK/sys/lib" \
 *   AIR_WEBKIT_EXECUTABLE="$WK/bin/MiniBrowser" NODE_PATH=<tooling-node_modules> \
 *     node tools/verify/webgl2-buffer-browser.cjs --out=output/buffer-candidate.json
 * EXTRA_LIBS may contain required libharfbuzz-icu, libhyphen and libGLESv2 from
 * official OS packages, depending on the bundle/platform. Provision dependencies
 * separately under the host's permissions. This collector never installs them,
 * changes loader settings, or retries browser/security failures with other flags.
 * Add --source-ref=<git-commit> to run a frozen source negative control.
 * Scope: exact AST-selected source functions with native GL calls and a small
 * device/cache fixture. This is not full-engine, compositor, or hardware-perf proof.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { parseArgs } = require('node:util');
const root = path.resolve(__dirname, '../..');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function main() {
    const { values } = parseArgs({
        options: { out: { type: 'string' }, 'source-ref': { type: 'string' } },
        strict: true,
        allowPositionals: false,
    });
    if (!values.out) throw new Error('A new --out=<report.json> is required.');
    const out = path.resolve(values.out);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const receipt = fs.openSync(out, 'wx');
    const report = {
        schema: 'buffer-native-webgl2/1',
        measuredAt: new Date().toISOString(),
        status: 'BLOCKED',
        scope: 'AST-selected exact source functions with native WebGL2; not full engine build or hardware-performance acceptance',
        sourceKind: values['source-ref'] ? 'git-ref' : 'working-tree',
        browserClosed: false,
        browserCloseEvidence: 'Playwright browser.close() promise only; physical waitpid/ECHILD is not collected',
        pageErrors: [],
    };
    let browser;
    let sourceSnapshot;
    let read;
    try {
        const executable = process.env.AIR_WEBKIT_EXECUTABLE;
        if (!executable)
            throw new Error('Set AIR_WEBKIT_EXECUTABLE to an explicitly selected installed WebKit launcher.');
        if (!fs.existsSync(executable)) throw new Error('AIR_WEBKIT_EXECUTABLE does not exist.');
        const ts = require('typescript');
        const { webkit } = require('playwright');
        report.compiler = ts.version;
        report.playwright = require('playwright/package.json').version;
        report.browserExecutable = path.basename(executable);
        const sourceRef = values['source-ref']
            ? execFileSync('git', ['rev-parse', '--verify', '--end-of-options', `${values['source-ref']}^{commit}`], {
                  cwd: root,
                  encoding: 'utf8',
              }).trim()
            : null;
        report.sourceRevision =
            sourceRef ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
        read = (file) =>
            sourceRef
                ? execFileSync('git', ['show', `${sourceRef}:${file}`], { cwd: root, encoding: 'utf8' })
                : fs.readFileSync(path.join(root, file), 'utf8');
        const files = [
            'src/cocos/gfx/webgl2/webgl2-commands.ts',
            'src/cocos/gfx/base/define.ts',
            'src/cocos/gfx/gl-constants.ts',
        ];
        sourceSnapshot = new Map(files.map((file) => [file, read(file)]));
        const select = (file, names) => {
            const source = ts.createSourceFile(file, sourceSnapshot.get(file), ts.ScriptTarget.Latest, true);
            const found = new Map();
            for (const statement of source.statements) {
                const declared = ts.isVariableStatement(statement)
                    ? statement.declarationList.declarations.map((item) => item.name.text)
                    : [statement.name?.text];
                for (const name of names.filter((name) => declared.includes(name))) {
                    if (found.has(name)) throw new Error(`Duplicate source declaration: ${name}`);
                    found.set(name, statement.getText(source));
                }
            }
            for (const name of names) if (!found.has(name)) throw new Error(`Missing source declaration: ${name}`);
            return names.map((name) => found.get(name)).join('\n');
        };
        const selected =
            select(files[1], ['BufferUsageBit', 'MemoryUsageBit']) +
            '\n' +
            sourceSnapshot.get(files[2]) +
            '\n' +
            select(files[0], [
                'gfxStateCache',
                'WebGL2CmdFuncUpdateBuffer',
                'WebGL2CmdFuncBindStates',
                'WebGL2CmdFuncInvalidateState',
                'WebGL2CmdFuncDestroyBuffer',
            ]);
        const compiled = ts.transpileModule(
            selected.replace(/\bexport (?=(?:function|class|enum|const|let|var)\b)/g, ''),
            {
                compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
                reportDiagnostics: true,
            },
        );
        if (compiled.diagnostics?.length)
            throw new Error(
                ts.formatDiagnosticsWithColorAndContext(compiled.diagnostics, {
                    getCurrentDirectory: () => root,
                    getCanonicalFileName: (file) => file,
                    getNewLine: () => '\n',
                }),
            );
        const bundle = `const systemInfo={os:'browser'}; const OS={IOS:'iOS'};
function errorID(id){throw Error('errorID '+id)}
${compiled.outputText}
window.__probeSource={WebGL2CmdFuncUpdateBuffer,WebGL2CmdFuncBindStates,WebGL2CmdFuncDestroyBuffer,WebGL2CmdFuncInvalidateState};`;
        report.sourceFiles = [...sourceSnapshot].map(([file, source]) => ({ file, sha256: hash(source) }));
        report.scriptSha256 = hash(bundle);
        report.collectorSha256 = hash(fs.readFileSync(__filename));
        browser = await webkit.launch({ executablePath: executable, headless: true, timeout: 30000 });
        report.browser = await browser.version();
        const page = await browser.newPage();
        page.on('pageerror', (error) => report.pageErrors.push(error.message));
        await page.setContent('<canvas width="4" height="4"></canvas>');
        await page.addScriptTag({ content: bundle });
        report.results = await page.evaluate(() => {
            const gl = document
                .querySelector('canvas')
                .getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
            if (!gl) throw Error('WebGL2 unavailable');
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            const environment = {
                api: gl.getParameter(gl.VERSION),
                renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
                vendor: gl.getParameter(gl.VENDOR),
                shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
                uboAlignment: gl.getParameter(gl.UNIFORM_BUFFER_OFFSET_ALIGNMENT),
            };
            const api = window.__probeSource;
            const cases = [];
            const assert = (ok, message) => {
                if (!ok) throw Error(message);
            };
            const checkError = () => assert(gl.getError() === gl.NO_ERROR, 'unexpected native WebGL error');
            const cache = () => ({
                glVAO: null,
                glArrayBuffer: null,
                glElementArrayBuffer: null,
                glUniformBuffer: null,
                glBindUBOs: Array(8).fill(null),
                glBindUBOOffsets: Array(8).fill(0),
                glBindUBOSizes: Array(8).fill(0),
                glProgram: null,
                rs: {},
                dss: {},
                bs: { blendColor: {} },
                glTexUnits: [],
                glSamplerUnits: [],
            });
            const run = (name, fn) => {
                try {
                    api.WebGL2CmdFuncInvalidateState();
                    const detail = fn();
                    checkError();
                    cases.push({ name, passed: true, ...detail });
                } catch (error) {
                    cases.push({ name, passed: false, error: error.message });
                    for (let attempt = 0; attempt < 32 && gl.getError() !== gl.NO_ERROR; attempt++) {}
                }
            };
            for (const target of [gl.ARRAY_BUFFER, gl.ELEMENT_ARRAY_BUFFER, gl.UNIFORM_BUFFER])
                run(`typedarray-disjoint-byte-updates-${target}`, () => {
                    const c = cache(),
                        device = { gl, getStateCache: () => c, extensions: { useVAO: true } };
                    const handle = gl.createBuffer();
                    gl.bindBuffer(target, handle);
                    gl.bufferData(target, new Uint8Array(24).fill(199), gl.DYNAMIC_DRAW);
                    const gpu = { glBuffer: handle, glTarget: target, size: 24, usage: 0, memUsage: 0 };
                    const words = new Uint16Array([0xffff, 0x1234, 0xabcd, 0x5678, 0xffff]);
                    const view = words.subarray(1, 4);
                    api.WebGL2CmdFuncUpdateBuffer(device, gpu, view, 0, 4);
                    api.WebGL2CmdFuncUpdateBuffer(device, gpu, view, 12, 4);
                    const actual = new Uint8Array(24);
                    gl.bindBuffer(target, handle);
                    gl.getBufferSubData(target, 0, actual);
                    const expected = new Uint8Array(24).fill(199);
                    const prefix = new Uint8Array(view.buffer, view.byteOffset, 4);
                    expected.set(prefix, 0);
                    expected.set(prefix, 12);
                    assert(
                        actual.every((x, i) => x === expected[i]),
                        `bytes mismatch ${Array.from(actual)}`,
                    );
                    gl.deleteBuffer(handle);
                    return { actual: Array.from(actual), expected: Array.from(expected) };
                });
            run('native-ubo-zero-offset-range-changes-two-block-pixels-and-delete', () => {
                const shader = (type, source) => {
                    const s = gl.createShader(type);
                    gl.shaderSource(s, source);
                    gl.compileShader(s);
                    assert(gl.getShaderParameter(s, gl.COMPILE_STATUS), gl.getShaderInfoLog(s));
                    return s;
                };
                const vs = shader(
                    gl.VERTEX_SHADER,
                    '#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}',
                );
                const fs = shader(
                    gl.FRAGMENT_SHADER,
                    '#version 300 es\nprecision highp float;layout(std140) uniform A {vec4 a;};layout(std140) uniform B {vec4 b;};out vec4 color;void main(){color=vec4(a.r,b.g,0.0,1.0);}',
                );
                const program = gl.createProgram();
                gl.attachShader(program, vs);
                gl.attachShader(program, fs);
                gl.linkProgram(program);
                assert(gl.getProgramParameter(program, gl.LINK_STATUS), gl.getProgramInfoLog(program));
                gl.uniformBlockBinding(program, gl.getUniformBlockIndex(program, 'A'), 0);
                gl.uniformBlockBinding(program, gl.getUniformBlockIndex(program, 'B'), 1);
                const alignment = environment.uboAlignment,
                    handle = gl.createBuffer(),
                    backingSize = alignment * 3 + 32;
                gl.bindBuffer(gl.UNIFORM_BUFFER, handle);
                gl.bufferData(gl.UNIFORM_BUFFER, backingSize, gl.DYNAMIC_DRAW);
                const c = cache(),
                    device = { gl, getStateCache: () => c, capabilities: {}, extensions: { useVAO: true } };
                const backing = {
                    usage: 0,
                    memUsage: 0,
                    glTarget: gl.UNIFORM_BUFFER,
                    glBuffer: handle,
                    size: backingSize,
                };
                api.WebGL2CmdFuncUpdateBuffer(
                    device,
                    backing,
                    new Float32Array([9, 1, 0, 0, 1, 9]).subarray(1, 5),
                    0,
                    16,
                );
                api.WebGL2CmdFuncUpdateBuffer(
                    device,
                    backing,
                    new Float32Array([9, 0, 1, 0, 1, 9]).subarray(1, 5),
                    alignment * 2,
                    16,
                );
                const a = { glBuffer: handle, glOffset: 0, size: 16 },
                    b = { glBuffer: handle, glOffset: alignment, size: 16 };
                const set = { descriptorIndices: [0, 1], gpuDescriptors: [{ gpuBuffer: a }, { gpuBuffer: b }] };
                const pipeline = {
                    gpuShader: {
                        glProgram: program,
                        glBlocks: [
                            { set: 0, binding: 0, glBinding: 0 },
                            { set: 0, binding: 1, glBinding: 1 },
                        ],
                        glSamplerTextures: [],
                    },
                    gpuPipelineLayout: { dynamicOffsetIndices: [[-1, 0]] },
                    dynamicStates: [],
                };
                const bind = () => api.WebGL2CmdFuncBindStates(device, pipeline, null, [set], [alignment], {});
                bind();
                const firstSizes = [0, 1].map((i) => gl.getIndexedParameter(gl.UNIFORM_BUFFER_SIZE, i));
                const offsets = [0, 1].map((i) => gl.getIndexedParameter(gl.UNIFORM_BUFFER_START, i));
                assert(firstSizes[0] === 16 && firstSizes[1] === 16, 'view range not 16 bytes: ' + firstSizes);
                assert(offsets[0] === 0 && offsets[1] === alignment * 2, 'dynamic offsets wrong: ' + offsets);
                a.size = 32;
                bind();
                const resized = gl.getIndexedParameter(gl.UNIFORM_BUFFER_SIZE, 0);
                assert(resized === 32, 'same-offset range change did not rebind: ' + resized);
                a.size = 16;
                bind();
                gl.viewport(0, 0, 4, 4);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
                const pixels = new Uint8Array(4);
                gl.readPixels(2, 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                assert(
                    pixels[0] === 255 && pixels[1] === 255 && pixels[2] === 0 && pixels[3] === 255,
                    'two-block output wrong: ' + pixels,
                );
                checkError();
                api.WebGL2CmdFuncDestroyBuffer(device, backing);
                assert(c.glBindUBOs[0] === null && c.glBindUBOs[1] === null, 'deleted handle retained in cache');
                assert(c.glBindUBOSizes[0] === 0 && c.glBindUBOSizes[1] === 0, 'deleted range retained');
                assert(
                    gl.getIndexedParameter(gl.UNIFORM_BUFFER_BINDING, 0) === null &&
                        gl.getIndexedParameter(gl.UNIFORM_BUFFER_BINDING, 1) === null,
                    'native deleted buffer still bound',
                );
                gl.deleteProgram(program);
                gl.deleteShader(vs);
                gl.deleteShader(fs);
                return {
                    firstSizes,
                    offsets,
                    rangeAfterSameOffsetChange: resized,
                    readPixels: Array.from(pixels),
                    nativeDeletionBindings: [null, null],
                };
            });
            return { environment, cases, passed: cases.every((x) => x.passed) };
        });
        report.status = report.results.passed && report.pageErrors.length === 0 ? 'PASS' : 'FAIL';
        await page.close();
    } catch (error) {
        report.status = 'BLOCKED';
        report.error = error.stack;
    } finally {
        if (browser) {
            try {
                await browser.close();
                report.browserClosed = true;
            } catch (error) {
                report.status = 'FAIL';
                report.closeError = error.stack;
            }
        }
        if (sourceSnapshot) {
            try {
                report.sourceUnchanged = [...sourceSnapshot].every(([file, source]) => read(file) === source);
                if (!report.sourceUnchanged) report.status = 'FAIL';
            } catch (error) {
                report.sourceUnchanged = false;
                report.status = 'FAIL';
                report.sourceCheckError = error.message;
            }
        }
        report.completedAt = new Date().toISOString();
        try {
            fs.writeFileSync(receipt, JSON.stringify(report, null, 2) + '\n');
        } finally {
            fs.closeSync(receipt);
        }
    }
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.status === 'PASS' ? 0 : 1;
}
main().catch((error) => {
    console.error(error.stack);
    process.exitCode = 1;
});
