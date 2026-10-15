const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const root = path.resolve(__dirname, '../..');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
function colors(pixels) {
    assert.equal(pixels.length,4);
    return pixels.map(([r,g,b,a]) => { assert.equal(a,255); const bits = [r,g,b].map((v) => v > 180 ? 1 : v < 30 ? 0 : -1).join('');
        return ({'100':'red','010':'green','001':'blue','110':'yellow'})[bits] || 'unknown'; });
}
async function main() {
    const arg = process.argv.find((v) => v.startsWith('--out=')); assert(arg,'--out=<new.json> required');
    const output = path.resolve(root,arg.slice(6)); assert(!fs.existsSync(output),'new report required');
    const files = ['build/cocosair.module.js', 'build/cocosair.module.d.ts', 'examples/shared/canvas-texture.js', 'src/cocos/asset/assets/image-asset.ts', 'src/cocos/asset/assets/texture-2d.ts', 'src/cocos/primitive/plane.ts', 'test/fixtures/texture-source-review/index.html', 'test/fixtures/texture-source-review/main.ts', 'tools/verify/air-texture-source-review.cjs', 'tools/verify/browser-engines.cjs'];
    const fingerprints = Object.fromEntries(files.map((f) => [f,hash(f)])), startedAt = new Date().toISOString(), results = [];
    const built = await require('esbuild').build({entryPoints:[path.join(root,'test/fixtures/texture-source-review/main.ts')],bundle:true,write:false,
        format:'esm',target:'es2022',platform:'browser',external:['cocosair','/build/*']});
    const pw = require('playwright'), server = await startExampleServer(root);
    const artifacts = output.replace(/\.json$/,'-artifacts'); fs.mkdirSync(artifacts,{recursive:true});
    try {
        for (const engine of ['chromium','firefox','webkit']) {
            let browser, observation, release, version;
            try {
                browser = await pw[engine].launch({...launchOptions(engine),headless:true}); version = browser.version();
                const page = await browser.newPage({viewport:{width:480,height:360}}), errors=[];
                page.on('pageerror',(error) => errors.push(String(error)));
                await page.route('**/main.ts',(route) => route.fulfill({contentType:'text/javascript',body:built.outputFiles[0].text}));
                await page.goto(server.origin+'/test/fixtures/texture-source-review/');
                await page.waitForFunction(() => window.__textureSourceReview?.ready,null,{timeout:60000});
                observation = await page.evaluate(() => window.__textureSourceReview.render());
                console.error(JSON.stringify({engine,observation}));
                const expected = new Set();
                for (const kind of ['sprite','plane']) {
                    for (const source of ['htmlImage','canvas','imageBitmap']) for (const stage of ['beforeByteUploads','afterByteUploads']) expected.add([kind,source,stage].join('/'));
                    for (const source of ['rawTopFirst','rawBottomFirst','copyCanvasRows','memoryImageTopFirst']) expected.add([kind,source,'byteUploads'].join('/'));
                }
                assert.equal(observation.observations.length,expected.size);
                for (const value of observation.observations) {
                    assert(expected.delete([value.kind,value.source,value.stage].join('/')),'Missing/duplicate/unknown observation');
                    const bottomFirst = ['rawBottomFirst','copyCanvasRows'].includes(value.source), upright = (value.kind === 'sprite') !== bottomFirst;
                    assert.deepEqual(colors(value.pixels), upright ? ['red','green','blue','yellow'] : ['blue','yellow','red','green']);
                    if (value.stage === 'afterByteUploads') { assert.equal(value.sameTexture,true); assert.equal(value.sameFrame,true); }
                }
                assert.equal(expected.size,0); assert.equal(observation.imageData.status,'NOT_APPLICABLE');
                assert.deepEqual(observation.errors,[]); assert.deepEqual(errors,[]);
                const screenshot = path.join(artifacts,engine+'.png'); await page.screenshot({path:screenshot});
                release = await page.evaluate(() => window.__textureSourceReview.release());
                assert.equal(release.receipt.status,'released'); assert.deepEqual(release.receipt.pending,[]);
                assert(release.valid.length>0 && release.valid.every((v) => v===false));
                assert.equal(release.textureRefs.length,7); assert(release.textureRefs.every((v) => v===0)); assert(release.imageRefs.every((v) => v===0));
                results.push({engine,status:'PASS',version,observation,release,screenshot:path.relative(root,screenshot)});
            } catch(error) { results.push({engine,status:'FAIL',version,observation,release,error:String(error.stack||error)}); }
            finally { await browser?.close(); }
            console.error(JSON.stringify({engine,status:results.at(-1).status,error:results.at(-1).error}));
        }
        for (const file of files) assert.equal(hash(file),fingerprints[file],'candidate drift: '+file);
        const passed = results.length===3 && results.every((row) => row.status==='PASS');
        fs.writeFileSync(output,JSON.stringify({startedAt,endedAt:new Date().toISOString(),command:process.argv,cwd:root,
            method:'REAL_BROWSER',subset:true,completed:false,scopePassed:passed,
            scope:['HTML image/canvas/bitmap and typed array/memory image with native Sprite and +90X plane UVs; original DOM textures/frames before and after byte uploads; actual ownership release'],
            fingerprints,results,limitations:['ImageData is a compile-time NOT_APPLICABLE source, not forced into unsupported engine upload','No physical device, all color-space/compressed-texture or GPU allocation certification']},null,2)+'\n',{flag:'wx'});
        process.exitCode=passed?0:1;
    } finally { await server.close(); }
}
main().catch((error) => {console.error(error);process.exitCode=1;});
