// PG-33 six application recipes. Check raw observations, never fixture pass flags.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const root = path.resolve(__dirname, '../..');
const IDS = ['r1-code3d','r2-input-hud','r3-pointer-lock','r4-camera-modes','r5-shared-assets','r6-optional-svcs'];
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const red = (p) => { assert.equal(p.length,4); assert(Math.abs(p[0]-229)<=3 && p[1]<10 && p[2]<10 && p[3]===255,JSON.stringify(p)); };
const green = (p) => { assert.equal(p.length,4); assert(p[0]<10 && p[1]>240 && p[2]<10 && p[3]===255,JSON.stringify(p)); };
const black = (p) => { assert.equal(p.length,4); assert(p.slice(0,3).every((v)=>v<10),JSON.stringify(p)); };
function codes(negative, expected) { assert.equal(negative.cases.length,expected.length); assert.deepEqual(negative.cases.map((v)=>v.errorCode),expected); assert(negative.cases.every((v)=>typeof v.error==='string' && v.error.length>0)); }
function checkRecipe(id,p) {
    assert.deepEqual(Object.keys(p).sort(),['construct','run','pauseRestart','negatives','release'].sort());
    const {construct:c,run:r,pauseRestart:s,negatives:n,release:d}=p;
    assert.equal(d.rootValid,false);
    if(id==='r1-code3d') {
        red(c.pixel); red(r.pixel); assert(c.meshValid && c.materialValid && c.boxParent); black(s.pausedPixel); red(s.restartedPixel);
        assert.deepEqual(s.rotation,[0,0,0]); codes(n,['AIR_E_ORTHO_WIDTH','AIR_E_PRIMITIVE_DESCRIPTOR']); assert.equal(n.widthBefore,n.widthAfter); assert(n.meshValid);
        assert.deepEqual(d.assetsValid,[false,false]);
    } else if(id==='r2-input-hud') {
        assert.equal(c.attached,true); assert.equal(c.steps,0); assert.equal(r.zero.steps,0); assert(r.zero.held && !r.zero.pressed); assert.equal(r.zero.ticks.length,0);
        assert.equal(r.one.steps,1); assert.equal(r.one.x,2); assert.equal(r.one.ticks[0].transitions.length,1); assert.equal(r.one.ticks[0].transitions[0].kind,'press');
        assert.equal(r.many.steps,4); assert.equal(r.many.x,8); assert(r.many.ticks.slice(1).every((t)=>t.transitions.length===0));
        assert.equal(r.released.steps,5); assert.equal(r.released.x,8); assert.equal(r.released.held,false); assert.equal(r.released.ticks[4].transitions[0].kind,'release');
        assert.equal(r.released.label,'X=8 steps=5'); assert(r.released.inkPixels>100); assert.equal(s.before.x,s.after.x); assert.equal(s.before.steps,s.after.steps);
        assert.equal(s.restarted.x,0); assert.equal(s.restarted.steps,0); assert.equal(s.restarted.held,false);
        codes(n,['AIR_E_UNKNOWN_ACTION','AIR_E_INVALID_VALUE']); assert.equal(d.attached,false); assert.equal(d.held,false); assert.equal(d.reattach.errorCode,'AIR_E_DISPOSED');
        assert.equal(r.pauseTrusted.before.x,r.pauseTrusted.after.x); assert.equal(r.pauseTrusted.before.steps,r.pauseTrusted.after.steps); assert.equal(r.pauseTrusted.after.held,false); assert.equal(r.pauseTrusted.after.ticks.length,r.pauseTrusted.before.ticks.length);
        assert.equal(r.retired.held,false); assert.equal(r.retired.steps,0);
    } else if(id==='r3-pointer-lock') {
        assert.equal(r.before.requestTrusted,true); red(r.after.pixel);
        assert.equal(s.before.yaw,s.after.yaw); assert.equal(s.before.moves,s.after.moves); assert.equal(s.restarted.yaw,0);
        codes(n,['NotFoundError','NotFoundError']); assert.equal(d.snapshot.disposed,true); assert.deepEqual(r.retiredBefore,r.retiredAfter); assert.deepEqual(d.assetsValid,[false,false]);
        assert.equal(r.pauseTrusted.before.yaw,r.pauseTrusted.after.yaw); assert.equal(r.pauseTrusted.before.moves,r.pauseTrusted.after.moves);
        if(r.before.locked && !r.unavailableReason) {
            assert(r.after.moves>r.before.moves); assert(r.after.trustedMoves>r.before.trustedMoves); assert(Math.abs(r.after.yaw-r.before.yaw)>0);
            const delta=r.after.acceptedMoves.slice(r.before.acceptedMoves.length);
            assert(delta.length>0 && delta.every((v)=>v.trusted));
            assert(Math.abs(r.after.yaw-r.before.yaw-delta.reduce((sum,v)=>sum+v.dx,0)*0.2)<1e-6);
        }
        else assert(r.unavailableReason,'unavailable pointer lock must disclose reason');
    } else if(id==='r4-camera-modes') {
        red(c.pixel); red(r.chasePixel); red(r.flightPixel); assert.deepEqual(r.chase.target,[2,0,-1]); assert.deepEqual(r.chase.camera,[2,2,5]); assert.deepEqual(r.flight.camera,[6,4,5]);
        assert(Math.abs(r.chase.vehicleForward[0]+1)<1e-5); assert(Math.abs(r.chase.groundForward[1])<1e-5);
        assert.deepEqual(s.before,s.after); assert.deepEqual(s.restarted.target,[0,0,0]); red(s.pixel);
        codes(n,['RECIPE_INVALID_TARGET','RECIPE_VERTICAL_BASIS']); assert.deepEqual(n.cameraBefore,n.cameraAfter); assert.equal(d.terminal.errorCode,'RECIPE_TARGET_DISPOSED');
        assert.deepEqual(d.assetsValid,[false,false]);
    } else if(id==='r5-shared-assets') {
        assert.equal(c.frame,4); assert.equal(c.texture,1); assert(c.sameFrame); assert.equal(c.pixels.length,3); c.pixels.forEach(green);
        assert.equal(r.hidden.frame,4); assert.equal(r.hidden.texture,1); assert.equal(r.hidden.pool,1); black(r.hiddenPixels[0]); black(r.hiddenPixels[1]); green(r.hiddenPixels[2]);
        assert.equal(r.replacement.oldValid,false); assert.equal(r.replacement.newValid,true); assert.equal(r.replacement.peersPreserved,true); assert.equal(r.replacement.refs.frame,4); assert(r.reusedSameNode); assert.equal(r.after.pool,0); r.pixels.forEach(green); black(s.pausedPixel); green(s.restartedPixel); assert.equal(s.before.frame,s.after.frame);
        assert.equal(n.cases.length,2); assert.equal(n.cases[0].once,1); assert.equal(n.cases[0].twice,1); assert(n.cases[0].sameNode); assert.equal(n.cases[1].value,null); assert.equal(n.cases[1].size,0);
        assert.equal(d.beforeOwnerRelease.frame,1); assert.equal(d.refs.frame,0); assert.equal(d.refs.texture,0); assert.equal(d.frameValid,false); assert.equal(d.textureValid,false);
        assert.deepEqual(d.refs.nodesValid,[false,false,false]);
    } else if(id==='r6-optional-svcs') {
        assert(c.startAlreadyReady && c.labelAttached && c.bankLoaded && c.audioLoaded);assert(c.inkPixels>100);
        assert.equal(r.trustedRun,true);assert(r.trustedCanvasGestures>0);assert(r.inkPixels>100);assert.equal(r.counter,'1');assert.equal(r.counterSet,true);
        assert.equal(r.bankSize,1);assert.equal(r.bankRefCount,1);assert.equal(r.clipRefCount,1);assert.equal(r.manifestRefCount,1);
        assert(n.inkPixels>100 && n.peerValid);assert.equal(n.cases.length,3);
        assert.equal(n.cases[0].errorCode,'AIR_E_EXT_REQUIRED');assert.equal(n.cases[1].errorCode,'AIR_E_LOAD_FAILED');
        assert(n.cases.slice(0,2).every((v)=>v.measurements.rejected && v.measurements.inFlight===0 && v.measurements.bankSize===1));
        assert(n.http404.length>0 && n.http404.every((v)=>v.status===404 && v.url===n.cases[1].measurements.url));
        assert.equal(n.cases[2].measurements.raw,'{broken json');assert(n.cases[2].measurements.parseError);assert.equal(n.cases[2].measurements.recovered,'0');
        assert(d.samePromise && d.peerBeforeCallerCleanup && d.borrowedValid.every(Boolean));
        assert.equal(d.labelNodeValid,false);assert(d.serviceNodesValid.length>0 && d.serviceNodesValid.every((v)=>v===false));
        assert.equal(d.clipRefCount,0);assert.equal(d.manifestRefCount,0);assert.equal(d.bankSize,0);assert.equal(d.inFlight,0);
        assert.equal(d.ourKeysCleared,true);assert.equal(d.restored.length,2);assert(d.restored.every((v)=>v.before===v.after));
        if(!r.unavailableReason) {
            assert(r.clockWindow.available && s.clockWindow.available);
            for(const state of [r.stateBefore,r.stateAfter,s.pre,s.resumed,s.restarted]) assert(state.playing && Number.isFinite(state.currentTime));
            assert.equal(s.paused.playing,false);assert.equal(s.stopped.playing,false);
            assert(r.stateAfter.currentTime-r.stateBefore.currentTime>0.1);
            assert(s.pre.currentTime>0.1);assert(Math.abs(s.paused.currentTime-s.pre.currentTime)<=0.03);
            assert(s.resumed.currentTime-s.paused.currentTime>0.1);assert.equal(s.stopped.currentTime,0);assert(s.restarted.currentTime>0.1);
        } else assert(typeof r.unavailableReason==='string');
    }
}
async function main() {
    const args=process.argv.slice(2); assert(args.every((v)=>(/^--(?:browser|out)=/.test(v) || v==='--installed')));
    const arg=args.find((v)=>v.startsWith('--out=')); assert(arg,'--out=<new.json> required'); const output=path.resolve(root,arg.slice(6)); assert(!fs.existsSync(output),'choose a new report');
    const selection=args.find((v)=>v.startsWith('--browser='))?.slice(10)||'all', engines=selection==='all'?['chromium','firefox','webkit']:[selection];
    assert(engines.every((v)=>['chromium','firefox','webkit'].includes(v)));
    const installedMode=args.includes('--installed');
    const files=['package.json','build/npm/cocosair.module.js','build/cocosair.module.js','build/cocosair.module.d.ts','test/fixtures/port-recipes/main.ts','docs/manual/examples/manual-port-recipes/main.ts','test/fixtures/port-recipes/contract.ts','test/fixtures/port-recipes/index.html',
        'docs/manual/examples/manual-port-recipes/optional-recipe.ts','docs/manual/examples/manual-port-recipes/optional-assets/manifest.json','docs/manual/examples/manual-port-recipes/optional-assets/tone4s.wav',
        'tools/verify/air-port-recipes-browser.cjs','tools/verify/browser-engines.cjs','tools/verify/competitive-example-server.cjs','tools/verify/installed-recipe-package.cjs'];
    const fingerprints=Object.fromEntries(files.map((f)=>[f,hash(f)])),startedAt=new Date().toISOString(),results=[];
    const artifacts=output.replace(/\.json$/,'-artifacts'); fs.mkdirSync(artifacts,{recursive:true});
    const built=await require('esbuild').build({entryPoints:[path.join(root,'test/fixtures/port-recipes/main.ts')],bundle:true,write:false,format:'esm',target:'es2022',platform:'browser',external:['cocosair']});
    // Parse emitted JS before spending browser timeout on a compiler classification error.
    await require('esbuild').transform(built.outputFiles[0].text,{loader:'js',format:'esm',target:'es2022'});
    let installed,server,assetServer; const pw=require('playwright');
    try {
        if(installedMode) { installed=await require('./installed-recipe-package.cjs').prepareInstalledRecipes(root); await require('esbuild').transform(installed.fixtureBody,{loader:'js',format:'esm',target:'es2022'});assetServer=await installed.startAssetServer();installed.identity.assetDelivery={method:'REAL_HTTP_VERIFIED_INSTALLED_BYTES',origin:assetServer.origin,workspaceFallback:false}; }
        server=await startExampleServer(root);
        for(const engine of engines) {
            let browser,version; const pageErrors=[], recipes=[],buildRequests=[];
            try {
                browser=await pw[engine].launch({...launchOptions(engine),headless:true});version=browser.version();
                const page=await browser.newPage({viewport:{width:480,height:360},deviceScaleFactor:1}), httpResponses=[];
                page.on('response',(r)=>httpResponses.push({url:r.url(),status:r.status()}));
                await page.bringToFront();
                page.on('pageerror',(e)=>pageErrors.push(String(e)));
                page.on('request',(r)=>{if(new URL(r.url()).pathname.startsWith('/build/')) buildRequests.push(r.url());});
                if(installed) {
                    await page.route('**/installed/**',(route)=>{const pathname=new URL(route.request().url()).pathname,body=installed.contents.get(pathname);return body===undefined?(pathname.startsWith('/installed/assets/')?route.continue():route.abort()):route.fulfill({contentType:installed.mimeTypes.get(pathname)||'text/javascript',body});});
                    await page.route('**/test/fixtures/port-recipes/',(route)=>route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'test/fixtures/port-recipes/index.html'),'utf8').replace('/build/cocosair.module.js','/installed/runtime.js').replace('<canvas id="GameCanvas"','<canvas data-recipe-assets="'+assetServer.origin+'/assets/" id="GameCanvas"')}));
                }
                await page.route('**/main.ts',(r)=>r.fulfill({contentType:'text/javascript',body:installed?.fixtureBody||built.outputFiles[0].text}));
                // Installed assets and the intercepted installed entry share an
                // origin; do not introduce cross-origin permissions into this
                // package-consumer test. No workspace engine fallback exists.
                await page.goto((assetServer?.origin||server.origin)+'/test/fixtures/port-recipes/'); await page.waitForFunction(()=>window.__portRecipes?.ready,null,{timeout:45000});
                assert.deepEqual(await page.evaluate(()=>window.__portRecipes.ids),IDS);
                for(const id of IDS) {
                    const phases={}; let status='PASS',error,releaseIdentity,terminal;
                    const call=(method,...args)=>page.evaluate(({id,method,args})=>window.__portRecipes.recipes[id][method](...args),{id,method,args});
                    try {
                        phases.construct=await call('construct');
                        const duplicate=await page.evaluate(async(id)=>{try{await window.__portRecipes.recipes[id].construct();return null;}catch(e){return e.code;}},id);assert.equal(duplicate,'RECIPE_ALREADY_CONSTRUCTED');
                        if(id==='r2-input-hud') {
                            await page.keyboard.down('KeyD'); const zero=await call('step',0),one=await call('step',1/60),many=await call('step',3/60);
                            await page.keyboard.up('KeyD'); const released=await call('step',1/60); const pauseBefore=await call('pauseInput'); await page.keyboard.down('KeyD'); await page.keyboard.up('KeyD'); const pauseAfter=await call('step',3/60); await call('restartInput'); phases.run={zero,one,many,released,pauseTrusted:{before:pauseBefore,after:pauseAfter}};
                        } else if(id==='r3-pointer-lock') {
                            await page.locator('#lockBtn').click(); await page.waitForTimeout(150); const before=await call('snapshot');
                            const rect=await page.locator('#lockBtn').boundingBox(),x=rect.x+rect.width/2,y=rect.y+rect.height/2;
                            if(before.locked) {
                                // Firefox's protocol positions are relative to the locked
                                // viewport centre; Chromium uses the last protocol position.
                                // Both paths still deliver real trusted DOM movement events.
                                if(engine==='firefox') { await page.mouse.move(241,181);await page.waitForTimeout(50);await page.mouse.move(243,182); }
                                else { await page.mouse.move(x+3,y+1,{steps:3});await page.waitForTimeout(50);await page.mouse.move(x+8,y+3,{steps:3}); }
                                await page.waitForTimeout(100);
                            } const after=await call('run');
                            const pauseBefore=await call('pauseInput');await page.mouse.move(x+12,y+6,{steps:3});const pauseAfter=await call('snapshot');await call('restartInput');
                            phases.run={before,after,pauseTrusted:{before:pauseBefore,after:pauseAfter},...(!before.locked || after.moves<=before.moves?{unavailableReason:before.lastError||'Pointer lock acquired, but trusted relative mouse movement was not delivered by this headless automation'}:{})};
                            if(phases.run.unavailableReason) status='NOT_RUN';
                        } else if(id==='r6-optional-svcs') {
                            await page.locator('#optionalBtn').click();await page.waitForTimeout(100);
                            for(let poll=0;poll<240;poll++) {
                                if(poll%12===0) await page.locator('#GameCanvas').click({position:{x:400,y:250}});
                                await page.waitForTimeout(50);
                                if((await call('snapshot')).runResult) break;
                            }
                            await page.waitForFunction(()=>{const r=window.__portRecipes.recipes['r6-optional-svcs'].snapshot();return r.runResult||r.runError;},null,{timeout:30000});
                            const observed=await call('snapshot');assert.equal(observed.runError,null);phases.run=observed.runResult;
                            if(!phases.run.stateBefore || !phases.run.stateAfter || phases.run.stateAfter.currentTime-phases.run.stateBefore.currentTime<=0.1) {status='NOT_RUN';phases.run.unavailableReason=phases.run.audioError||phases.run.playError||'Trusted playback button did not advance the native audio clock';}
                        } else phases.run=await call('run');
                        if(id==='r6-optional-svcs') {
                            const pausing=call('pauseRestart');await page.waitForTimeout(250);await page.locator('#GameCanvas').click({position:{x:400,y:250}});await page.waitForTimeout(200);await page.locator('#GameCanvas').click({position:{x:400,y:250}});phases.pauseRestart=await pausing;
                        } else phases.pauseRestart=await call('pauseRestart');
                        phases.negatives=await call('negatives');
                        if(id==='r6-optional-svcs') {
                            const missing=phases.negatives.cases[1].measurements.url, requests=httpResponses.filter((r)=>r.url===missing);
                            assert(requests.length>0 && requests.every((r)=>r.status===404));phases.negatives.http404=requests;
                            const s=phases.pauseRestart;
                            if(!s.pre || s.pre.currentTime<=0.1 || !s.resumed || !s.restarted || s.resumed.currentTime-s.paused.currentTime<=0.1 || s.restarted.currentTime<=0.1) {status='NOT_RUN';phases.run.unavailableReason=phases.run.unavailableReason||'Native audio pause/resume/restart clock was unavailable after trusted playback';}
                        }
                        await page.screenshot({path:path.join(artifacts,`${engine}-${id}.png`)});
                    } catch(e) {status='FAIL';error=String(e.stack||e);}
                    finally { try {phases.release=await call('release');}catch(e){status='FAIL';error=(error||'')+' release: '+String(e);} }
                    if(id==='r3-pointer-lock' && phases.run) { phases.run.retiredBefore=await call('snapshot'); await page.mouse.move(100,200,{steps:4}); await page.waitForTimeout(50); phases.run.retiredAfter=await call('snapshot'); }
                    if(id==='r2-input-hud' && phases.run) { await page.keyboard.down('KeyD');await page.keyboard.up('KeyD');phases.run.retired=await call('snapshot'); }
                    releaseIdentity=await page.evaluate((id)=>{const r=window.__portRecipes.recipes[id];return r.release()===r.release();},id); assert.equal(releaseIdentity,true);
                    terminal=await page.evaluate(async(id)=>{const r=window.__portRecipes.recipes[id],out={};for(const key of ['construct','run','pauseRestart']){try{await r[key]();out[key]=null;}catch(e){out[key]=e.code;}}return out;},id);
                    assert.deepEqual(terminal,{construct:'RECIPE_DISPOSED',run:'RECIPE_DISPOSED',pauseRestart:'RECIPE_DISPOSED'});
                    if(status!=='FAIL') {try{checkRecipe(id,phases);}catch(e){status='FAIL';error=String(e.stack||e);} }
                    recipes.push({id,status,phases,error,releaseIdentity,terminal,screenshot:path.relative(root,path.join(artifacts,`${engine}-${id}.png`))});
                    console.error(JSON.stringify({engine,id,status,error}));
                }
                assert.deepEqual(pageErrors,[]); if(installed) assert.deepEqual(buildRequests,[],'Installed test requested workspace /build'); const clock=await page.evaluate(()=>window.__portRecipes.snapshot());assert.equal(clock.enginePaused,true);
                await page.evaluate(()=>window.__portRecipes.close());
                results.push({engine,version,status:recipes.some((v)=>v.status==='FAIL')?'FAIL':recipes.some((v)=>v.status==='NOT_RUN')?'NOT_RUN':'PASS',recipes,pageErrors,buildRequests,clock});
            } catch(e) {results.push({engine,version,status:'FAIL',recipes,pageErrors,buildRequests,error:String(e.stack||e)});}
            finally {await browser?.close();}
            fs.writeFileSync(path.join(artifacts,engine+'.log'),JSON.stringify(results.at(-1),null,2)+'\n');
        }
        for(const f of files) assert.equal(hash(f),fingerprints[f],'candidate drift: '+f);
        const scopePassed=results.length===engines.length && results.every((v)=>v.status==='PASS');
        fs.writeFileSync(output,JSON.stringify({schemaVersion:'air-port-recipes/2',startedAt,endedAt:new Date().toISOString(),command:process.argv,cwd:root,
            method:installed?'REAL_BROWSER_INSTALLED_PACKAGE':'REAL_BROWSER',installed:installed?.identity||null,playwrightVersion:require('playwright/package.json').version,fingerprints,scope:IDS,subset:true,completed:false,scopePassed,
            notRun:results.flatMap((b)=>b.recipes.filter((r)=>r.status==='NOT_RUN').map((r)=>({engine:b.engine,id:r.id,reason:r.phases.run.unavailableReason}))),
            limitations:['Six application recipes; not a full 35-item gate','Pointer lock/audio clock absence is NOT_RUN','Camera target guards are application policy; pointer capture negatives are DOM API behavior',
                'Controlled business dt; trusted Playwright keyboard/mouse checked separately','GPU memory unavailable','No external original app comparison'],results},null,2)+'\n',{flag:'wx'});
        process.exitCode=scopePassed?0:1;
    } finally {await server?.close();await assetServer?.close(); installed?.cleanup();}
}
if(require.main===module) main().catch((e)=>{console.error(e);process.exitCode=1;});
module.exports={checkRecipe,IDS};
