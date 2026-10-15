const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const root = path.resolve(__dirname, '../..');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
function colors(pixels) {
    return pixels.map(([r,g,b,a]) => {
        assert.equal(a,255); const bits = [r,g,b].map((value) => value > 180 ? 1 : value < 30 ? 0 : -1).join('');
        return ({'100':'red', '010':'green', '001':'blue', '110':'yellow'})[bits] || 'unknown';
    });
}
async function main() {
    const arg = process.argv.find((value) => value.startsWith('--out=')); assert(arg, '--out=<new.json> required');
    const output = path.resolve(root, arg.slice(6)); assert(!fs.existsSync(output), 'new report required');
    const files = ['build/cocosair.module.js', 'src/air/assets/gltf/material.ts', 'src/air/assets/gltf/mesh.ts', 'src/air/assets/gltf/loader.ts', 'test/fixtures/gltf-texture-direction/index.html', 'test/fixtures/gltf-texture-direction/main.ts', 'tools/verify/air-gltf-texture-direction-browser.cjs', 'tools/verify/browser-engines.cjs'];
    const fingerprints = Object.fromEntries(files.map((file) => [file,hash(file)])), startedAt = new Date().toISOString(), results = [];
    const built = await require('esbuild').build({ entryPoints: [path.join(root,'test/fixtures/gltf-texture-direction/main.ts')],
        bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', external: ['cocosair', '/build/*'] });
    const artifacts = output.replace(/\.json$/, '-artifacts'); fs.mkdirSync(artifacts, {recursive:true});
    const server = await startExampleServer(root), pw = require('playwright');
    try {
        for (const engine of ['chromium','firefox','webkit']) {
            let browser, observation, release;
            try {
                browser = await pw[engine].launch({...launchOptions(engine),headless:true});
                const page = await browser.newPage({viewport:{width:480,height:360}}), errors = [], requests = [];
                page.on('pageerror', (error) => errors.push(String(error)));
                page.on('request', (request) => requests.push(new URL(request.url()).pathname));
                await page.route('**/main.ts', (route) => route.fulfill({contentType:'text/javascript',body:built.outputFiles[0].text}));
                // Serve a real encoded PNG over HTTP. Embedded case separately
                // decodes an image bufferView through the public parser.
                await page.route('**/gltf-quadrants.png', async (route) => {
                    const data = await page.evaluate(() => window.__gltfTextureDirection.pngURL);
                    return route.fulfill({contentType:'image/png',body:Buffer.from(data.split(',')[1],'base64')});
                });
                await page.goto(server.origin+'/test/fixtures/gltf-texture-direction/');
                await page.waitForFunction(() => window.__gltfTextureDirection?.ready, null, {timeout:60000});
                observation = await page.evaluate(() => window.__gltfTextureDirection.run());
                console.error(JSON.stringify({engine,observation}));
                assert.equal(observation.samples.length,4);
                for (const sample of observation.samples) {
                    assert.deepEqual(colors(sample.pixels), ['red','green','blue','yellow']);
                    if (sample.stage === 'initial') assert.equal(sample.samplerMatches,true);
                    else assert.equal(sample.sameTexture,true);
                }
                assert(observation.rejectedSampler?.includes('invalid texture wrap'));
                assert.deepEqual(observation.errors,[]); assert.deepEqual(errors,[]); assert(requests.includes('/gltf-quadrants.png'));
                const screenshot = path.join(artifacts,engine+'.png'); await page.screenshot({path:screenshot});
                release = await page.evaluate(() => window.__gltfTextureDirection.release());
                assert.equal(release.receipt.status,'released'); assert.deepEqual(release.receipt.pending,[]);
                assert([...release.nodesValid,...release.assetsValid,...release.ownedValid,...release.controlsValid].every((value) => value === false));
                assert(release.textureRefs.every((value) => value === 0));
                results.push({engine,status:'PASS',version:browser.version(),observation,release,requests,screenshot:path.relative(root,screenshot)});
            } catch(error) { results.push({engine,status:'FAIL',observation,release,error:String(error.stack||error)}); }
            finally { await browser?.close(); }
            console.error(JSON.stringify({engine,status:results.at(-1).status,error:results.at(-1).error}));
        }
        for (const file of files) assert.equal(hash(file),fingerprints[file],'candidate drift: '+file);
        const passed = results.length===3 && results.every((result) => result.status==='PASS');
        fs.writeFileSync(output,JSON.stringify({startedAt,endedAt:new Date().toISOString(),command:process.argv,cwd:root,method:'REAL_BROWSER',subset:true,completed:false,scopePassed:passed,
            scope:['Public GLTFLoader external PNG and embedded image bufferView, top-origin nearest/clamp sampling and unchanged original textures after interleaved byte uploads', 'Invalid sampler rejection and explicit instance/asset ownership cleanup'],
            fingerprints,results,limitations:['No compressed textures, complete color-space certification or all glTF sampler combinations','GPU allocation measurement unavailable']},null,2)+'\n',{flag:'wx'});
        process.exitCode = passed ? 0 : 1;
    } finally { await server.close(); }
}
main().catch((error) => {console.error(error);process.exitCode=1;});
