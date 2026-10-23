/** Explicit protected reference collection only. Requiring this file performs no I/O or browser launch.
 * No generated agent, scripted benchmark outcome or model metric is produced here.
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {
    sha256,
    inspectReferencePreparation,
    inspectArtifactRuntime,
    verifyExtractedArtifact,
} = require('../reference-contracts.cjs');
const { validateObservation } = require('./observations.cjs');
const sdk = require('./sdk-reference.cjs');
const { startRequestReferenceServer } = require('./request-server.cjs');
const { normalizeCocos } = require('./cocos-normalize.cjs');
const { launchOwnedBrowser, bounded } = require('../../../verify/upstream-browser-lifecycle.cjs');
const { launchOptions } = require('../../../verify/browser-engines.cjs');
const ROOT = path.resolve(__dirname, '../../../..');
const COLLECTOR_PATH = 'tools/benchmark/upstream/references/collect-reference.cjs';
const SUPPORTED = {
    cocosair: ['AU01', 'AU02', 'AU03', 'AU04', 'AU05', 'AU06', 'AU07', 'AU08', 'AU09', 'AU10', 'AU11', 'AU12'],
    three: ['AU01', 'AU02', 'AU03', 'AU04', 'AU05', 'AU06', 'AU07', 'AU08', 'AU09', 'AU10', 'AU11', 'AU12'],
};
function resourceBytes(root, resource) {
    let bytes;
    if (resource.sourceKind === 'checkout-file') bytes = fs.readFileSync(path.join(root, resource.sourcePath));
    else if (resource.sourceKind === 'literal-data-uri') bytes = Buffer.from(resource.base64, 'base64');
    else if (resource.sourceKind === 'request-payload')
        bytes = Buffer.from(
            require(path.join(root, resource.sourcePath)).payload(resource.payloadCase, resource.payloadResource).body,
        );
    else throw Error(`Unsupported frozen resource source: ${resource.sourceKind}`);
    if (sha256(bytes) !== resource.sha256) throw Error(`Frozen public resource changed: ${resource.id}`);
    return bytes;
}
function guardedFile(root, relative) {
    const base = fs.realpathSync(root),
        file = fs.realpathSync(path.resolve(base, relative));
    if (!file.startsWith(base + path.sep)) throw Error('Reference server path escape');
    return file;
}
async function startReferenceServer({ root, threePackageDir, runtimeFile, task, publicInputs, engine, sdkHandler }) {
    const requests = [],
        resources = new Map(
            publicInputs.resources.map((resource) => [
                '/' + resource.publicPath,
                { resource, bytes: resourceBytes(root, resource) },
            ]),
        );
    const resourceURLs = Object.fromEntries(
        publicInputs.resources.map((resource) => [resource.id, '/' + resource.publicPath]),
    );
    const serve = (req, res) => {
        try {
            const url = new URL(req.url, 'http://reference.invalid'),
                pathname = decodeURIComponent(url.pathname);
            requests.push({ method: req.method, path: pathname });
            if (resources.has(pathname)) {
                const { bytes } = resources.get(pathname);
                res.writeHead(200, {
                    'Content-Type': pathname.endsWith('.png')
                        ? 'image/png'
                        : pathname.endsWith('.gltf')
                          ? 'model/gltf+json'
                          : 'application/octet-stream',
                });
                res.end(bytes);
                return;
            }
            if (pathname === '/paired-readiness.html') {
                const imports = {
                    cocosair: '/frozen-cocos-module.js',
                    three: '/three/build/three.module.js',
                    'three/addons/': '/three/examples/jsm/',
                };
                const config = JSON.stringify({ engine, resourceURLs });
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`<!doctype html><html><head><script type="importmap">${JSON.stringify({ imports })}</script></head><body><div id="GameDiv"><div id="Cocos3dGameContainer"><canvas id="GameCanvas" width="640" height="360"></canvas></div></div><script type="module">
const config=${config};
if(config.engine==='cocosair') { await import('/tools/benchmark/upstream/references/cocos-readiness-reference.mjs'); }
else { const THREE=await import('three'); const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
const {startThreeReadiness}=await import('/tools/benchmark/upstream/references/three-readiness-reference.mjs');
window.__readiness = startThreeReadiness({THREE,GLTFLoader,canvas:document.querySelector('canvas'),resourceURLs:Object.fromEntries(Object.entries(config.resourceURLs).map(([k,v])=>[k,new URL(v,location.href).href])),mode:new URLSearchParams(location.search).get('case')}); }
</script></body></html>`);
                return;
            }
            if (pathname === '/paired-reference.html') {
                const imports = {
                    cocosair: '/frozen-cocos-module.js',
                    three: '/three/build/three.module.js',
                    'three/addons/': '/three/examples/jsm/',
                };
                const options = JSON.stringify({ taskId: task.id, engine, resourceURLs });
                const html = `<!doctype html><html><head><script type="importmap">${JSON.stringify({ imports })}</script></head><body><div id="GameDiv"><div id="Cocos3dGameContainer"><canvas id="GameCanvas" width="640" height="360"></canvas></div></div><script type="module">
const config=${options};
const resourceURLs=Object.fromEntries(Object.entries(config.resourceURLs).map(([k,v])=>[k,new URL(v,location.href).href]));
try {
let observation;
if(['AU01','AU02','AU03'].includes(config.taskId)) {
 const {runRequestReference}=await import('/tools/benchmark/upstream/references/request-reference.mjs');
 const cc=config.engine==='cocosair'?await import('cocosair'):undefined;
 const THREE=config.engine==='three'?await import('three'):undefined;
 const GLTFLoader=config.engine==='three'?(await import('three/addons/loaders/GLTFLoader.js')).GLTFLoader:undefined;
 observation=await runRequestReference(config.taskId,{engine:config.engine,cc,THREE,GLTFLoader,canvas:'#GameCanvas',fixtureOrigin:location.origin});
} else if(config.engine==='three') {
 const THREE=await import('three'); const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const {clone:cloneSkeleton}=await import('three/addons/utils/SkeletonUtils.js');
 const {runThreeReference}=await import('/tools/benchmark/upstream/references/three-runner.mjs');
 observation=await runThreeReference(config.taskId,{THREE,GLTFLoader,cloneSkeleton,canvas:document.querySelector('canvas'),resourceURLs});
} else {
 const cc=await import('cocosair');
 if(['AU04','AU10'].includes(config.taskId)) { const {runCocosInstanceReference}=await import('/tools/benchmark/upstream/references/cocos-instance-reference.mjs'); observation=await runCocosInstanceReference(config.taskId,{cc,canvas:'#GameCanvas',resourceURLs}); }
 else { const {runCocosMaterialReference}=await import('/tools/benchmark/upstream/references/cocos-material-reference.mjs'); observation=await runCocosMaterialReference(config.taskId,{cc,canvas:'#GameCanvas',resourceURLs}); }
}
window.__pairedClose=observation.close || (()=>{}); window.__pairedObservation=JSON.parse(JSON.stringify(observation));
} catch(error) { window.__pairedError=String(error.stack||error); }
</script></body></html>`;
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(html);
                return;
            }
            let file;
            if (pathname === '/frozen-cocos-module.js' || pathname === '/build/cocosair.module.js') file = runtimeFile;
            else if (pathname.startsWith('/three/')) file = guardedFile(threePackageDir, pathname.slice(7));
            else {
                let relative = pathname.slice(1);
                if (relative.endsWith('/')) relative += 'index.html';
                if (!fs.existsSync(path.join(root, relative)) && !path.extname(relative)) relative += '.ts';
                file = guardedFile(root, relative);
            }
            const extension = path.extname(file),
                bytes =
                    extension === '.ts'
                        ? require('esbuild').transformSync(fs.readFileSync(file, 'utf8'), {
                              loader: 'ts',
                              format: 'esm',
                              target: 'es2022',
                          }).code
                        : fs.readFileSync(file);
            res.writeHead(200, {
                'Content-Type': ['.ts', '.js', '.mjs'].includes(extension)
                    ? 'text/javascript'
                    : extension === '.html'
                      ? 'text/html'
                      : extension === '.png'
                        ? 'image/png'
                        : 'application/octet-stream',
            });
            res.end(bytes);
        } catch (error) {
            res.writeHead(404);
            res.end(String(error.message));
        }
    };
    const server = http.createServer((req, res) =>
        sdkHandler ? sdkHandler(req, res, () => serve(req, res)) : serve(req, res),
    );
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    return {
        origin: `http://127.0.0.1:${server.address().port}`,
        requests,
        close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    };
}
async function collectReadiness(browser, { engine, origin, out, browserName, seed }) {
    const rows = [],
        cases = [],
        cleanups = [];
    let compositor, browserIdentity;
    for (const mode of ['cold', 'delayed-resource', 'offscreen', 'shader-failure', 'context-lost']) {
        const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
        const page = await context.newPage(),
            row = { mode, errors: [] };
        rows.push(row);
        page.on('pageerror', (error) => row.errors.push(String(error.stack || error)));
        try {
            await page.addInitScript((initial) => {
                let x = initial >>> 0;
                Math.random = () => {
                    x ^= x << 13;
                    x ^= x >>> 17;
                    x ^= x << 5;
                    return (x >>> 0) / 4294967296;
                };
            }, seed);
            const url = new URL('/paired-readiness.html', origin);
            url.searchParams.set('case', mode);
            url.searchParams.set('resource', new URL('/assets/showroom/inspection-rig.gltf', origin).href);
            await page.goto(url.href);
            await page.waitForFunction(() => window.__readiness?.submission || window.__readiness?.report, undefined, {
                timeout: 30000,
            });
            const snapshot = await page.evaluate(() => ({
                submission: window.__readiness.submission,
                readback: window.__readiness.readback,
                report: window.__readiness.report,
            }));
            if (snapshot.submission && !snapshot.report) {
                const bytes = await page.locator('canvas').screenshot();
                const png = require('pngjs').PNG.sync.read(bytes),
                    offset = (Math.floor(png.height / 2) * png.width + Math.floor(png.width / 2)) * 4;
                const center = [...png.data.subarray(offset, offset + 4)];
                const contentValidated =
                    snapshot.readback?.length === 4 &&
                    center.some((v, i) => i < 3 && v > 8) &&
                    center.every((v, i) => Math.abs(v - snapshot.readback[i]) <= 2);
                row.compositor = { center, readback: snapshot.readback, contentValidated };
                fs.writeFileSync(path.join(out, `readiness-${mode}.png`), bytes);
                if (!compositor) compositor = bytes;
                await page.evaluate((receipt) => window.__readiness.present(receipt), {
                    source: 'browser-compositor',
                    submissionId: snapshot.submission.id,
                    sha256: sha256(bytes),
                    width: png.width,
                    height: png.height,
                    contentValidated,
                    pixels: center,
                });
            }
            await page.waitForFunction(() => !!window.__readiness?.report, undefined, { timeout: 30000 });
            const observed = await page.evaluate(() => ({
                report: window.__readiness.report,
                shaderFault: window.__readiness.shaderFault,
                observerAuthority: window.__readiness.observerAuthority || window.__readiness.report.observerAuthority,
            }));
            row.observation = { report: observed.report, shaderFault: observed.shaderFault };
            row.observerAuthority = observed.observerAuthority;
            if (engine === 'three') cases.push(observed.report);
            if (!browserIdentity)
                browserIdentity = {
                    name: browserName,
                    version: browser.version(),
                    backend: 'webgl2',
                    ...(await page.evaluate(() => {
                        const gl = document.querySelector('canvas').getContext('webgl2'),
                            debug = gl?.getExtension('WEBGL_debug_renderer_info');
                        return {
                            renderer: gl?.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
                            device: gl?.getParameter(gl.VERSION),
                        };
                    })),
                };
            cleanups.push(await page.evaluate(() => window.__readiness.close()));
            if (row.errors.length) throw Error(`Unexpected readiness page error in ${mode}`);
        } finally {
            await bounded(() => context.close(), 4000, 'readiness context close');
        }
    }
    fs.writeFileSync(path.join(out, 'native-readiness-observations.json'), JSON.stringify({ rows }, null, 2) + '\n');
    const observation =
        engine === 'cocosair'
            ? normalizeCocos('AU11', { rows })
            : {
                  schema: 'upstream-agent-observation/1',
                  contractId: 'upstream-agent-observation/1:AU11',
                  taskId: 'AU11',
                  engine,
                  status: 'OBSERVED_NOT_VALIDATED',
                  cases,
              };
    validateObservation(observation);
    return { observation, compositor, browserIdentity, cleanup: cleanups };
}
async function collectSDKReference(browser, { prepared, cpu, origin, out, browserName, seed }) {
    const rows = [];
    let compositor, browserIdentity, development;
    try {
        development = await sdk.startSDKViteDevelopment(prepared, { execute: true });
        for (const mode of prepared.browserModes) {
            const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
            const page = await context.newPage(),
                errors = [];
            page.on('pageerror', (error) => errors.push(String(error.stack || error)));
            try {
                await page.addInitScript((initial) => {
                    let x = initial >>> 0;
                    Math.random = () => {
                        x ^= x << 13;
                        x ^= x >>> 17;
                        x ^= x << 5;
                        return (x >>> 0) / 4294967296;
                    };
                }, seed);
                const url =
                    mode === 'vite-development' ? development.origin + '/' : origin + prepared.browserAPI.routes[mode];
                await page.goto(url);
                await page.waitForFunction(() => window.__sdkReference?.completion, undefined, { timeout: 30000 });
                const row = await page.evaluate(() => window.__sdkReference.completion);
                const bytes = await page.locator('canvas').screenshot(),
                    png = require('pngjs').PNG.sync.read(bytes);
                const offset = (Math.floor(png.height / 2) * png.width + Math.floor(png.width / 2)) * 4,
                    center = [...png.data.subarray(offset, offset + 4)];
                row.presentation = {
                    source: 'browser-compositor',
                    sha256: sha256(bytes),
                    pixels: center,
                    width: png.width,
                    height: png.height,
                    contentValidated:
                        row.pixels?.length === 4 &&
                        center.some((v, i) => i < 3 && v > 8) &&
                        center.every((v, i) => Math.abs(v - row.pixels[i]) <= 2),
                };
                if (!row.presentation.contentValidated) throw Error('SDK compositor/readback mismatch');
                fs.writeFileSync(path.join(out, `sdk-${mode}.png`), bytes);
                if (!compositor) compositor = bytes;
                if (!browserIdentity)
                    browserIdentity = {
                        name: browserName,
                        version: browser.version(),
                        backend: 'webgl2',
                        ...(await page.evaluate(() => {
                            const gl = document.querySelector('canvas').getContext('webgl2'),
                                debug = gl?.getExtension('WEBGL_debug_renderer_info');
                            return {
                                renderer: gl?.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
                                device: gl?.getParameter(gl.VERSION),
                            };
                        })),
                    };
                row.closeReceipt = await page.evaluate(() => window.__sdkReference.close());
                row.collectorPageErrors = errors;
                rows.push(row);
                if (errors.length) throw Error(`Unexpected SDK page errors in ${mode}`);
            } finally {
                await bounded(() => context.close(), 4000, 'SDK context close');
            }
        }
        const observation = sdk.finalizeSDKObservation(prepared, cpu, rows);
        fs.writeFileSync(
            path.join(out, 'sdk-evidence.json'),
            JSON.stringify({ prepared, cpu, browsers: rows }, null, 2) + '\n',
        );
        fs.cpSync(cpu.attemptDir, path.join(out, 'sdk-cpu'), { recursive: true, errorOnExist: true });
        const sourceDir = path.join(out, 'sdk-preparation');
        fs.mkdirSync(sourceDir);
        for (const entry of prepared.generatedSources) {
            const target = path.join(sourceDir, entry.path);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.copyFileSync(path.join(prepared.outputDir, entry.path), target);
        }
        fs.copyFileSync(path.join(prepared.outputDir, 'preparation.json'), path.join(sourceDir, 'preparation.json'));
        const evidenceIndex = [];
        const walk = (dir) => {
            for (const name of fs.readdirSync(dir).sort()) {
                const file = path.join(dir, name);
                if (fs.statSync(file).isDirectory()) walk(file);
                else evidenceIndex.push({ path: path.relative(out, file), sha256: sha256(fs.readFileSync(file)) });
            }
        };
        walk(sourceDir);
        walk(path.join(out, 'sdk-cpu'));
        for (const mode of prepared.browserModes)
            evidenceIndex.push({
                path: `sdk-${mode}.png`,
                sha256: sha256(fs.readFileSync(path.join(out, `sdk-${mode}.png`))),
            });
        fs.writeFileSync(path.join(out, 'sdk-evidence-index.json'), JSON.stringify(evidenceIndex, null, 2) + '\n');
        return { observation, compositor, browserIdentity, cleanup: rows.map((row) => row.closeReceipt) };
    } finally {
        if (development) await bounded(() => development.close(), 4000, 'SDK Vite close');
    }
}
async function collectReference({
    root = ROOT,
    engine,
    taskId,
    seed,
    out,
    browserName = 'chromium',
    threePackageDir,
    engineArtifactPath,
    runtimeFile,
    sdkConfig,
}) {
    if (!SUPPORTED[engine]?.includes(taskId))
        throw Error(`${engine}/${taskId}: no complete protected collector configuration is prepared`);
    if (!['chromium', 'firefox', 'webkit'].includes(browserName)) throw Error('Explicit supported browser required');
    if (!out || fs.existsSync(out)) throw Error('A fresh output directory is required; preserve every prior attempt');
    const publicInputs = JSON.parse(fs.readFileSync(path.join(root, 'tools/benchmark/upstream/public-inputs.json')));
    const task = publicInputs.tasks.find((t) => t.id === taskId);
    if (!task?.repetitionSeeds.includes(seed)) throw Error('Seed is not frozen for this task');
    const preparation = inspectReferencePreparation(root, { threePackageDir });
    const prepared = preparation.tasks.find((t) => t.taskId === taskId).references[engine];
    if (!prepared.sourceReady) throw Error(`Reference sources not ready: ${JSON.stringify(prepared.blockers)}`);
    if (!engineArtifactPath || !runtimeFile)
        throw Error('Exact engine artifact and extracted runtime entry paths must be explicit');
    const runtimeIdentity = inspectArtifactRuntime(
        engineArtifactPath,
        engine,
        sha256(fs.readFileSync(engineArtifactPath)),
    );
    if (engine === 'three') verifyExtractedArtifact(engineArtifactPath, threePackageDir);
    if (sha256(fs.readFileSync(runtimeFile)) !== runtimeIdentity.runtimeModuleSha256)
        throw Error('Served runtime does not match public ESM entry in the frozen archive');
    fs.mkdirSync(out, { recursive: true });
    const report = {
        schema: 'upstream-agent-reference-invocation/1',
        startedAt: new Date().toISOString(),
        engine,
        taskId,
        seed,
        commonInputSha256: task.commonInputSha256,
        generatedTrial: false,
        modelCalls: 0,
        collectorSha256: sha256(fs.readFileSync(path.join(root, COLLECTOR_PATH))),
        sourceFingerprints: Object.fromEntries(prepared.sourceIds.map((id) => [id, preparation.sources[id].sha256])),
        engineArtifactSha256: sha256(fs.readFileSync(engineArtifactPath)),
        runtimeModuleSha256: sha256(fs.readFileSync(runtimeFile)),
        browserClosed: false,
        serverClosed: false,
        exitCode: null,
        pageErrors: [],
    };
    let server,
        requestServer,
        sdkPrepared,
        sdkCPU,
        owned,
        context,
        observation,
        compositor,
        browserIdentity,
        failure,
        closeSymbol;
    try {
        if (taskId === 'AU12') {
            if (!sdkConfig)
                throw Error('AU12 requires trusted isolated installed consumer/tool/resource configuration');
            const modelBase = new URL('.', new URL(sdkConfig.modelURL, 'http://reference.invalid'));
            for (const resourceId of task.resourceIds) {
                const resource = publicInputs.resources.find((row) => row.id === resourceId);
                const urlPath = new URL(resourceId.replace(/^http-/, ''), modelBase).pathname;
                const configured = sdkConfig.localResources?.find((row) => row.urlPath === urlPath);
                if (
                    !configured ||
                    configured.sha256 !== resource.sha256 ||
                    sha256(fs.readFileSync(configured.file)) !== resource.sha256
                )
                    throw Error(`SDK public resource does not match frozen common input: ${resourceId}`);
            }
            sdkPrepared = sdk.prepareSDKConsumer({
                ...sdkConfig,
                engine,
                package: { ...sdkConfig.package, archivePath: engineArtifactPath, sha256: report.engineArtifactSha256 },
            });
            if (sdkPrepared.status !== 'PREPARED_NOT_EXECUTED') throw Error(JSON.stringify(sdkPrepared));
            sdkCPU = sdk.collectSDKCPU(sdkPrepared, { execute: true });
            if (sdkCPU.status !== 'CPU_OBSERVED_BROWSER_PENDING')
                throw Error('AU12 CPU consumer failed; retain its raw attempt');
        }
        server = await startReferenceServer({
            root,
            threePackageDir,
            runtimeFile,
            task,
            publicInputs,
            engine,
            sdkHandler: sdkPrepared ? sdk.createSDKRequestHandler(sdkPrepared, sdkCPU) : undefined,
        });
        if (['AU01', 'AU02', 'AU03'].includes(taskId))
            requestServer = await startRequestReferenceServer({ root, staticOrigin: server.origin });
        owned = await launchOwnedBrowser(
            require('playwright')[browserName],
            { headless: true, ...launchOptions(browserName) },
            report,
        );
        if (taskId === 'AU12') {
            const collected = await collectSDKReference(owned.browser, {
                prepared: sdkPrepared,
                cpu: sdkCPU,
                origin: server.origin,
                out,
                browserName,
                seed,
            });
            ({ observation, compositor, browserIdentity } = collected);
            report.cleanup = collected.cleanup;
        } else if (taskId === 'AU11') {
            const collected = await collectReadiness(owned.browser, {
                engine,
                origin: server.origin,
                out,
                browserName,
                seed,
            });
            ({ observation, compositor, browserIdentity } = collected);
            report.cleanup = collected.cleanup;
        } else {
            context = await owned.browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
            const page = await context.newPage();
            page.on('pageerror', (error) => report.pageErrors.push(String(error.stack || error)));
            // Deterministic application PRNG. Never touches a provider/model seed.
            await page.addInitScript((initial) => {
                let x = initial >>> 0;
                Math.random = () => {
                    x ^= x << 13;
                    x ^= x >>> 17;
                    x ^= x << 5;
                    return (x >>> 0) / 4294967296;
                };
            }, seed);
            const nativeFixture = engine === 'cocosair' && ['AU07', 'AU08', 'AU09'].includes(taskId);
            const fixture = taskId === 'AU09' ? 'upstream-skinning' : 'upstream-state-isolation';
            await page.goto(
                (requestServer?.origin || server.origin) +
                    (nativeFixture ? `/test/fixtures/${fixture}/` : '/paired-reference.html'),
            );
            if (nativeFixture) {
                const symbol = taskId === 'AU09' ? '__upstreamSkinning' : '__upstreamState';
                await page.waitForFunction((name) => window[name]?.ready, symbol, { timeout: 30000 });
                if (taskId === 'AU09')
                    await page.exposeFunction('__pairedCheckpoint', async (detail) => {
                        if (detail.stage === 'combined' && !compositor)
                            compositor = await page.locator('canvas').screenshot();
                    });
                const raw = await page.evaluate(
                    ({ name, skinning }) =>
                        skinning ? window[name].run((detail) => window.__pairedCheckpoint(detail)) : window[name].run(),
                    { name: symbol, skinning: taskId === 'AU09' },
                );
                if (taskId === 'AU09')
                    raw.camera = await page.evaluate(async () => {
                        const cc = await import('/build/cocosair.module.js');
                        const node = cc.director.getScene().getChildByName('Fixed camera');
                        const camera = node.getComponent(cc.Camera),
                            canvas = document.querySelector('canvas');
                        return {
                            position: [node.position.x, node.position.y, node.position.z],
                            verticalHalfExtent: camera.orthoHeight,
                            aspect: canvas.width / canvas.height,
                        };
                    });
                fs.writeFileSync(path.join(out, 'native-observation.json'), JSON.stringify(raw, null, 2) + '\n');
                observation = normalizeCocos(taskId, raw);
                if (!compositor) compositor = await page.locator('canvas').screenshot();
                closeSymbol = symbol;
            } else {
                await page.waitForFunction(() => window.__pairedObservation || window.__pairedError, undefined, {
                    timeout: 120000,
                });
                const result = await page.evaluate(() => ({
                    observation: window.__pairedObservation,
                    error: window.__pairedError,
                }));
                if (result.error) throw Error(result.error);
                observation = result.observation;
                compositor = await page.locator('canvas').screenshot();
                closeSymbol = '__pairedClose';
            }
            browserIdentity = {
                name: browserName,
                version: owned.browser.version(),
                backend: 'webgl2',
                ...(await page.evaluate(() => {
                    const gl = document.querySelector('canvas').getContext('webgl2'),
                        debug = gl?.getExtension('WEBGL_debug_renderer_info');
                    return {
                        renderer: gl ? gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : null,
                        device: gl?.getParameter(gl.VERSION),
                    };
                })),
            };
            report.cleanup = await page.evaluate(
                (name) => (name === '__pairedClose' ? window.__pairedClose() : window[name].close()),
                closeSymbol,
            );
        }
        fs.writeFileSync(path.join(out, 'observation.json'), JSON.stringify(observation, null, 2) + '\n');
        fs.writeFileSync(path.join(out, 'compositor.png'), compositor);
        report.validation = validateObservation(observation);
        if (report.pageErrors.length) throw Error('Reference page errors');
        const after = inspectReferencePreparation(root, { threePackageDir });
        if (
            after.manifestSha256 !== preparation.manifestSha256 ||
            !after.tasks.find((t) => t.taskId === taskId).references[engine].sourceReady
        )
            throw Error('Reference source drift during collection');
        report.exitCode = 0;
    } catch (error) {
        failure = error;
        report.exitCode = 1;
        report.error = String(error.stack || error);
    } finally {
        try {
            if (context) await bounded(() => context.close(), 4000, 'reference context close');
        } catch (error) {
            report.closeError = String(error);
            report.exitCode = 1;
        }
        try {
            if (owned) await owned.close();
            report.browserClosed = !!owned;
        } catch (error) {
            report.browserCloseError = String(error);
            report.exitCode = 1;
        }
        try {
            if (requestServer) {
                await bounded(() => requestServer.close(), 4000, 'request reference server close');
                fs.writeFileSync(
                    path.join(out, 'request-server.json'),
                    JSON.stringify(requestServer.receipts(), null, 2) + '\n',
                );
            }
            if (server) await bounded(() => server.close(), 4000, 'reference server close');
            report.serverClosed = !!server;
        } catch (error) {
            report.serverCloseError = String(error);
            report.exitCode = 1;
        }
        report.requests = server?.requests || [];
        report.finishedAt = new Date().toISOString();
        fs.writeFileSync(path.join(out, 'invocation.json'), JSON.stringify(report, null, 2) + '\n');
    }
    if (report.exitCode !== 0) throw failure || Error('Reference cleanup failed; inspect retained invocation');
    const artifact = (name) => ({ path: name, sha256: sha256(fs.readFileSync(path.join(out, name))) });
    const receipt = {
        schema: 'upstream-agent-reference-receipt/1',
        taskId,
        engine,
        seed,
        contractId: task.contractId,
        commonInputSha256: task.commonInputSha256,
        manifestSha256: preparation.manifestSha256,
        engineArtifactSha256: report.engineArtifactSha256,
        runtimeModuleSha256: report.runtimeModuleSha256,
        collector: { path: COLLECTOR_PATH, sha256: report.collectorSha256, contractId: task.contractId },
        provenance: {
            kind: 'protected-reference-browser-collection',
            generatedTrial: false,
            scriptedBenchmarkRun: false,
        },
        startedAt: report.startedAt,
        finishedAt: report.finishedAt,
        browser: browserIdentity,
        artifacts: {
            observation: artifact('observation.json'),
            invocation: artifact('invocation.json'),
            compositor: artifact('compositor.png'),
            ...(requestServer ? { requestServer: artifact('request-server.json') } : {}),
            ...(sdkPrepared
                ? { sdkEvidence: artifact('sdk-evidence.json'), sdkEvidenceIndex: artifact('sdk-evidence-index.json') }
                : {}),
        },
    };
    fs.writeFileSync(path.join(out, 'reference-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    return receipt;
}
module.exports = { SUPPORTED, COLLECTOR_PATH, resourceBytes, startReferenceServer, collectReference };
if (require.main === module) {
    const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
    if (!process.argv.includes('--execute-protected-reference'))
        throw Error('Explicit --execute-protected-reference required; this is not an Agent benchmark');
    collectReference({
        engine: arg('engine'),
        taskId: arg('task'),
        seed: Number(arg('seed')),
        out: arg('out'),
        browserName: arg('browser') || 'chromium',
        threePackageDir: arg('three-package'),
        engineArtifactPath: arg('engine-artifact'),
        runtimeFile: arg('runtime-file'),
        sdkConfig: arg('sdk-config') ? JSON.parse(fs.readFileSync(arg('sdk-config'))) : undefined,
    })
        .then((receipt) => console.log(JSON.stringify(receipt, null, 2)))
        .catch((error) => {
            console.error(String(error.stack || error));
            process.exitCode = 1;
        });
}
