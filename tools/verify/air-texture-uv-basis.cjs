const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const root = path.resolve(__dirname,'../..');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
function colors(pixels) {
    return pixels.map(([r,g,b,a]) => { assert.equal(a,255); const bits = [r,g,b].map((v) => v > 180 ? 1 : v < 30 ? 0 : -1).join('');
        return ({'100':'red','010':'green','001':'blue','110':'yellow'})[bits] || 'unknown'; });
}
async function main() {
    const arg = process.argv.find((v) => v.startsWith('--out=')); assert(arg,'--out=<new.json> required');
    const output = path.resolve(root,arg.slice(6)); assert(!fs.existsSync(output),'new report required');
    const files = ['build/bootstrap.js','build/cocosair.module.js','examples/shared/canvas-texture.js','src/cocos/primitive/plane.ts',
        'test/fixtures/texture-uv-basis/index.html','test/fixtures/texture-uv-basis/main.ts','tools/verify/air-texture-uv-basis.cjs','tools/verify/browser-engines.cjs'];
    const fingerprints = Object.fromEntries(files.map((f) => [f,hash(f)])), startedAt = new Date().toISOString(), results = [];
    const built = await require('esbuild').build({entryPoints:[path.join(root,'test/fixtures/texture-uv-basis/main.ts')],bundle:true,write:false,format:'esm',target:'es2022',platform:'browser',external:['/build/*']});
    const playwright = require('playwright'), server = await startExampleServer(root);
    const artifacts = output.replace(/\.json$/,'-artifacts'); fs.mkdirSync(artifacts,{recursive:true});
    try {
        for (const engine of ['chromium','firefox','webkit']) {
            let browser, observation, release;
            try {
                browser = await playwright[engine].launch({...launchOptions(engine),headless:true});
                const page = await browser.newPage({viewport:{width:480,height:360}}), errors=[];
                page.on('pageerror',(error) => errors.push(String(error)));
                await page.route('**/main.ts',(route) => route.fulfill({contentType:'text/javascript',body:built.outputFiles[0].text}));
                await page.goto(server.origin+'/test/fixtures/texture-uv-basis/');
                await page.waitForFunction(() => window.__textureUVBasis?.ready,null,{timeout:60000});
                observation = await page.evaluate(() => window.__textureUVBasis.render());
                console.error(JSON.stringify({engine,observation}));
                for (const value of observation.observations) {
                    const upright = (value.kind === 'sprite') !== (value.source === 'copyCanvasRows');
                    assert.deepEqual(colors(value.pixels), upright ? ['red','green','blue','yellow'] : ['blue','yellow','red','green'], value.kind+' '+value.source);
                }
                assert.deepEqual(observation.errors,[]); assert.deepEqual(errors,[]);
                const screenshot = path.join(artifacts,engine+'.png'); await page.screenshot({path:screenshot});
                release = await page.evaluate(() => window.__textureUVBasis.release());
                assert.equal(release.receipt.status,'released'); assert(release.valid.every((v) => !v));
                results.push({engine,status:'PASS',version:browser.version(),observation,release,screenshot:path.relative(root,screenshot)});
            } catch (error) { results.push({engine,status:'FAIL',observation,release,error:String(error.stack||error)}); }
            finally { await browser?.close(); }
            console.error(JSON.stringify({engine,result:results.at(-1).status,error:results.at(-1).error}));
        }
        for (const file of files) assert.equal(hash(file),fingerprints[file],'candidate drift: '+file);
        const passed = results.length === 3 && results.every((r) => r.status === 'PASS');
        fs.writeFileSync(output,JSON.stringify({startedAt,endedAt:new Date().toISOString(),command:process.argv,cwd:root,scope:['Canvas/raw/helper rows with native Sprite versus native plane rotated +90X; reuse DOM texture after uploads'],
            method:'REAL_BROWSER',subset:true,completed:false,scopePassed:passed,fingerprints,results,limitations:['UV contracts differ between Sprite and this plane','GPU allocation measurements unavailable']},null,2)+'\n',{flag:'wx'});
        process.exitCode = passed ? 0 : 1;
    } finally { await server.close(); }
}
main().catch((error) => { console.error(error); process.exitCode=1; });
