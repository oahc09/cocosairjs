const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const esbuild = require('esbuild');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const root = path.resolve(__dirname, '../..'), hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
async function main() {
    const outputArg = process.argv.find((arg) => arg.startsWith('--out='));
    assert(outputArg, '--out=<new.json> required');
    const output = path.resolve(root,outputArg.slice(6)); assert(!fs.existsSync(output), 'new report required');
    const playwright = require('playwright'), startedAt = new Date().toISOString(), results = [];
    const artifacts = output.replace(/\.json$/, '-artifacts'); fs.mkdirSync(artifacts,{recursive:true});
    const files = ['build/cocosair.module.js','build/bootstrap.js','src/air/assets/asset-bank.ts',
        ...fs.readdirSync(path.join(root,'src/air/assets/atlas')).filter((n) => n.endsWith('.ts')).map((n) => 'src/air/assets/atlas/'+n),
        ...fs.readdirSync(path.join(root,'test/fixtures/atlas-browser-review')).map((n) => 'test/fixtures/atlas-browser-review/'+n),
        'tools/verify/air-atlas-browser-review.cjs','tools/verify/installed-atlas-package.cjs','tools/verify/browser-engines.cjs'];
    const fingerprints = Object.fromEntries(files.map((f) => [f,hash(f)]));
    // --installed routes the public probe to chunks built from an offline installed tarball.
    const built = await esbuild.build({ entryPoints: [path.join(root,'test/fixtures/atlas-browser-review/main.ts')], bundle:true, write:false, format:'esm', target:'es2022', platform:'browser', external:['/build/*'],
    });
    const installed = process.argv.includes('--installed') ? await require('./installed-atlas-package.cjs').prepareInstalledAtlas(root) : null;
    const server = await startExampleServer(root);
    try {
        for (const engine of ['chromium','firefox','webkit']) {
            let browser, observation, release;
            try {
                browser = await playwright[engine].launch({...launchOptions(engine),headless:true});
                const page = await browser.newPage({viewport:{width:480,height:360}}), errors=[], requests=[];
                page.on('request',(request)=>requests.push(new URL(request.url()).pathname));
                page.on('pageerror',(error)=>errors.push(String(error)));
                await page.route('**/main.ts',(route)=>route.fulfill({contentType:'text/javascript',body:built.outputFiles[0].text}));
                if(installed) await page.route((url)=>url.pathname.startsWith('/installed/')&&url.pathname.endsWith('.js'),(route)=>{
                    const body=installed.contents.get(new URL(route.request().url()).pathname);
                    return body ? route.fulfill({contentType:'text/javascript',body}) : route.abort();
                });
                const query=installed?'?bootstrap=/installed/bootstrap.js&runtime=/installed/runtime.js':'';
                await page.goto(server.origin+'/test/fixtures/atlas-browser-review/'+query);
                await page.waitForFunction(()=>window.__atlasReview?.ready,null,{timeout:60000});
                observation = await page.evaluate(()=>window.__atlasReview.render());
                console.error('[atlas-observation] '+JSON.stringify({engine,observation}));
                const screenshot = path.join(artifacts,engine+'.png'); await page.screenshot({path:screenshot});
                release = await page.evaluate(()=>window.__atlasReview.release());
                assert.deepEqual(observation.plain,[[255,0,0,255],[0,255,0,255],[0,0,255,255],[255,255,0,255]],'top-left atlas rectangle and upright asymmetric pixels');
                assert.deepEqual(observation.hero,[[255,128,0,255],[255,0,255,255]],'packed 90 degree rotation');
                assert.deepEqual(observation.trim,[[0,200,80,255],[0,80,40,255],[0,0,0,255],[0,0,0,255],[0,0,0,255]],'original size and left/bottom trim placement');
                assert.deepEqual(observation.walk,[[0,255,255,255],[255,255,255,255],[160,0,255,255]],'all indexed frames from second page');
                assert.deepEqual(observation.blob,[[0,255,255,255],[0,0,0,255]],'new offsets original dimensions and trim');
                assert.deepEqual(observation.pages,[[32,16],[16,16]]); assert.equal(observation.indexes,3);
                if(installed){assert(requests.includes('/installed/runtime.js'));assert(!requests.some((url)=>url.startsWith('/build/')),'workspace engine substituted for installed package');}
                assert.deepEqual(observation.errors,[]); assert.deepEqual(errors,[]);
                assert.equal(release.guarded,'AIR_E_ATLAS_IN_USE'); assert.equal(release.before.disposed,false);
                assert.equal(release.receipt.status,'released'); assert.equal(release.bankSize,0); assert.equal(release.disposed,true);
                assert(release.framesValid.every((v)=>!v),'owned frames reclaimed'); assert(release.textureRefs.every((v)=>v===0),'owned texture references returned');
                results.push({engine,status:'PASS',browserVersion:browser.version(),observation,release,requests,screenshot:path.relative(root,screenshot)});
            } catch(error) { results.push({engine,status:'FAIL',observation,release,error:String(error.stack||error)}); }
            finally { if(browser) await browser.close(); }
            console.error('[atlas-result] '+JSON.stringify(results.at(-1)));
        }
        for(const f of files) assert.equal(hash(f),fingerprints[f],'candidate drift: '+f);
        const passed = results.length===3 && results.every((r)=>r.status==='PASS');
        fs.writeFileSync(output,JSON.stringify({startedAt,endedAt:new Date().toISOString(),command:process.argv,cwd:root,
            scope:['Public Atlas runtime: legacy/compact, 90 rotation, trim, multipage indexed pixels and ownership'],
            subset:true,completed:false,scopePassed:passed,installed:installed?.identity||null,limitations:[...(installed?[]:['Installed-consumer atlas pixels not covered']),'GPU allocation measurements unavailable'],fingerprints,results},null,2)+'\n',{flag:'wx'});
        process.exitCode=passed?0:1;
    } finally { await server.close(); installed?.cleanup(); }
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
