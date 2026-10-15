const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const root = path.resolve(__dirname,'../..'), hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
async function main() {
    const arg = process.argv.find((v) => v.startsWith('--out=')); assert(arg,'--out=<new.json> required'); const output = path.resolve(root,arg.slice(6)); assert(!fs.existsSync(output),'new report required');
    const startedAt = new Date().toISOString(), results = [], files = ['build/cocosair.module.js', 'tools/build/effect-json.mjs', 'examples/shared/shader-blocks.js', 'tools/debug/agent-session.ts', 'tools/debug/effect-layout.ts', 'test/fixtures/effect-layout/index.html', 'test/fixtures/effect-layout/main.ts', 'test/fixtures/effect-layout/spec.json', 'tools/verify/air-effect-layout-browser.cjs', 'tools/verify/browser-engines.cjs'];
    const fingerprints = Object.fromEntries(files.map((f) => [f,hash(f)]));
    const {buildEffectJson} = await import(pathToFileURL(path.join(root,'tools/build/effect-json.mjs')));
    const effect = buildEffectJson(JSON.parse(fs.readFileSync(path.join(root,'test/fixtures/effect-layout/spec.json'),'utf8')));
    const built = await require('esbuild').build({entryPoints:[path.join(root,'test/fixtures/effect-layout/main.ts')],bundle:true,write:false,format:'esm',target:'es2022',platform:'browser',external:['/build/*'],alias:{cocosair:'/build/cocosair.module.js'}});
    const playwright = require('playwright'), server = await startExampleServer(root), artifacts = output.replace(/\.json$/,'-artifacts'); fs.mkdirSync(artifacts,{recursive:true});
    try {
        for (const engine of ['chromium','firefox','webkit']) {
            let browser, observation, release;
            try {
                browser = await playwright[engine].launch({...launchOptions(engine),headless:true}); const page = await browser.newPage({viewport:{width:480,height:360}}), pageErrors=[], consoleErrors=[];
                page.on('pageerror',(error) => pageErrors.push(String(error))); page.on('console',(entry) => {if(entry.type()==='error') consoleErrors.push(entry.text());});
                await page.route('**/main.ts',(route) => route.fulfill({contentType:'text/javascript',body:built.outputFiles[0].text}));
                await page.route('**/effect.json',(route) => route.fulfill({contentType:'application/json',body:JSON.stringify(effect)}));
                await page.goto(server.origin+'/test/fixtures/effect-layout/'); await page.waitForFunction(() => window.__effectLayout?.ready,null,{timeout:60000});
                observation = await page.evaluate(() => window.__effectLayout.run()); console.error(JSON.stringify({engine,observation}));
                for (const value of observation.results) {
                    assert.deepEqual(value.red,[255,0,0,255]); assert.deepEqual(value.green,[0,255,0,255]);
                    assert.equal(value.dimGreen[0],0); assert(Math.abs(value.dimGreen[1]-127.5)<=0.5); assert.deepEqual(value.dimGreen.slice(2),[0,255]);
                    assert.deepEqual(value.oldLocation,[0,0,0,255]); assert.deepEqual(value.newLocation,[255,0,0,255]); assert(value.passes>0);
                }
                for (const control of observation.controls) assert(control.pixel[0]>180&&control.pixel[1]<30&&control.pixel[2]<30);
                for (const control of observation.existingControls) { assert(control.pixel.slice(0,3).every((v) => v>180));assert(control.same); }
                assert.deepEqual(observation.automatic.pixel,[0,255,0,255]);
                for (const layout of observation.layouts) {
                    if (['explicit','automatic'].includes(layout.kind)) { assert.equal(layout.status,'PASS'); assert.deepEqual(layout.bindings.filter((b) => b.set===1).map((b) => b.binding),[0,1,2]); }
                    else { assert.equal(layout.status,'REJECTED'); assert.equal(layout.code,'AIR_E_EFFECT_LAYOUT'); assert.equal(layout.registered,false); }
                }
                for (const macro of observation.macros) assert.deepEqual(macro.pixel,macro.mode==='sharedTrue'?[0,255,0,255]:[255,0,0,255],macro.mode);
                for (const negative of observation.negatives) {
                    assert(negative.tool.errors.some((e) => e.category === (negative.stage === 'compile' ? 'shader' : 'link')),'tool misses '+negative.stage);
                    assert(negative.diagnostics.some((e) => e.id===(negative.stage==='compile'?16323:16326)&&e.message.includes(negative.program)),'native diagnostic misses program identity');
                    assert(negative.healthyPixel[0]>180&&negative.healthyPixel[1]<30&&negative.healthyPixel[2]<30,'healthy scene survives negative shader');
                }
                assert(observation.effectRegistered); assert.deepEqual(pageErrors,[]);
                assert(consoleErrors.some((e) => e.includes('unknownPortSymbol')),'native compiler output missing');
                const screenshot = path.join(artifacts,engine+'.png'); await page.screenshot({path:screenshot}); release = await page.evaluate(() => window.__effectLayout.release());
                assert.equal(release.receipt.status,'released'); assert(release.valid.every((v) => !v)); assert.equal(release.registered,false);assert.equal(release.builtinValid,true);
                results.push({engine,status:'PASS',version:browser.version(),observation,release,pageErrors,consoleErrors,screenshot:path.relative(root,screenshot)});
            } catch(error) {results.push({engine,status:'FAIL',observation,release,error:String(error.stack||error)});}
            finally {await browser?.close();} console.error(JSON.stringify({engine,status:results.at(-1).status,error:results.at(-1).error}));
        }
        for(const f of files) assert.equal(hash(f),fingerprints[f],'candidate drift: '+f);
        const passed = results.length===3&&results.every((r) => r.status==='PASS'); fs.writeFileSync(output,JSON.stringify({startedAt,endedAt:new Date().toISOString(),command:process.argv,cwd:root,
            method:'REAL_BROWSER',scope:['Generated dual sampler/material UBO vertex+fragment updates, effectName/effectAsset on MR/SMR, native compile/link diagnostics'],subset:true,completed:false,scopePassed:passed,fingerprints,results,
            limitations:['Optional preflight supports unconditional vec4/mat4 UBO and sampler2D layouts; it is not a GLSL compiler','SMR registration isolated from skeletal deformation','GPU allocation measurements unavailable']},null,2)+'\n',{flag:'wx'}); process.exitCode=passed?0:1;
    } finally {await server.close();}
}
main().catch((error) => {console.error(error);process.exitCode=1;});
