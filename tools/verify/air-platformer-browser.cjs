// PG-12: real TiledMap/Box2D contacts, independently checked motion and teardown.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const root = path.resolve(__dirname,'../..'), hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
function checkScenario(probe) {
    const expected = ['spawn','groundDeceleration','airConstant','oneWay','wallNegative','pauseNegative','tileQueryNegative','restart','pixels'];
    assert.deepEqual(Object.keys(probe.results).sort(),expected.sort(),'phase cardinality');
    const p = probe.results, near = (a,b,t=1) => assert(Math.abs(a-b)<t,`${a} differs from ${b}`);
    assert.equal(p.spawn.grounded,true); assert(p.spawn.supportTags.includes(1)); near(p.spawn.y,-73,2); near(p.spawn.vy,0);
    assert.equal(p.spawn.stoneCount,42); assert.equal(p.spawn.plankCount,3); assert(p.spawn.groundImpulseSteps>0);
    const ground = p.groundDeceleration;
    assert.equal(ground.releaseVx.length,51); assert.equal(ground.releaseGrounded.length,51);
    assert(ground.releaseGrounded.every(Boolean)); assert(ground.releaseVx[0]>60); assert(Math.abs(ground.releaseVx.at(-1))<1);
    assert(ground.releaseVx.slice(1).every((v,i) => Math.abs(v)<=Math.abs(ground.releaseVx[i])+0.05));
    assert.equal(ground.linearDamping,0); assert.equal(ground.playerFriction,0.2);
    assert.deepEqual(ground.actualGroundFrictions,[0.2]);
    const air = p.airConstant; assert.equal(air.samples.length,12); assert.equal(air.controlsReleased,true);
    assert(air.samples.every((v) => !v.grounded && v.vy>0 && Math.abs(v.vx)>60));
    assert(air.samples.every((v) => Math.abs(v.vx-air.samples[0].vx)<0.1));
    const one = p.oneWay; assert.equal(one.path.length,100); assert(one.passThroughSteps>0); assert(one.impulseSteps>0);
    assert(one.path.some((v) => v.vy>0 && v.y-7>one.platformTop));
    assert(one.path.filter((v) => v.vy>1).every((v) => !v.supportTags.includes(2)),'disabled rising contact cannot count as support');
    assert(one.final.grounded && one.final.supportTags.includes(2)); near(one.final.y,one.platformTop+7,2); near(one.final.vy,0);
    assert(one.path.slice(-10).every((v) => v.grounded && v.supportTags.includes(2) && Math.abs(v.vy)<1 && Math.abs(v.y-one.platformTop-7)<2));
    assert.equal(p.wallNegative.before.grounded,false); assert(p.wallNegative.after.vy<1,'wall cannot admit ground jump');
    const pause = p.pauseNegative; for (const key of ['x','y','vx','vy','fixedSteps']) assert.equal(pause.before[key],pause.after[key]);
    assert.equal(pause.after.renderedFrames-pause.before.renderedFrames,10); assert.equal(pause.enginePaused,true);
    const tile = p.tileQueryNegative; assert.equal(tile.emptyGid,0); assert.equal(tile.stoneGid,1); assert.equal(tile.plankGid,2);
    assert.equal(tile.unknownProps,null); assert(tile.outOfBoundsError || tile.outOfBoundsGid==null || tile.outOfBoundsGid===0);
    assert.equal(p.restart.grounded,true); near(p.restart.x,probe.playerSpawn.x); near(p.restart.y,-73,2); near(p.restart.vx,0); near(p.restart.vy,0);
    assert.equal(p.pixels.player.length,4); assert(p.pixels.player.slice(0,3).every((v)=>v>240)); assert.equal(p.pixels.player[3],255);
    assert.equal(p.pixels.tile.length,4); assert(p.pixels.tile.slice(0,3).every((v)=>v>70 && v<150)); assert.equal(p.pixels.tile[3],255);
}
async function main() {
    const args=process.argv.slice(2); assert(args.every((v)=>/^--(?:browser|out)=/.test(v)));
    const out=args.find((v)=>v.startsWith('--out=')); assert(out,'--out=<new.json> required');
    const output=path.resolve(root,out.slice(6)); assert(!fs.existsSync(output),'choose a new report');
    const selection=args.find((v)=>v.startsWith('--browser='))?.slice(10)||'all';
    const engines=selection==='all'?['chromium','firefox','webkit']:[selection]; assert(engines.every((v)=>['chromium','firefox','webkit'].includes(v)));
    const files=['build/cocosair.module.js','build/cocosair.module.d.ts','test/fixtures/platformer-recipe/index.html',
        'test/fixtures/platformer-recipe/main.ts','test/fixtures/platformer-recipe/recipe-contract.ts','test/fixtures/platformer-recipe/level.tmx',
        'test/fixtures/platformer-recipe/platformer.tsx','test/fixtures/platformer-recipe/tiles.png','tools/verify/air-platformer-browser.cjs',
        'tools/verify/browser-engines.cjs','tools/verify/competitive-example-server.cjs'];
    const fingerprints=Object.fromEntries(files.map((f)=>[f,hash(f)])), startedAt=new Date().toISOString(), results=[];
    const artifacts=output.replace(/\.json$/,'-artifacts'); fs.mkdirSync(artifacts,{recursive:true});
    const built=await require('esbuild').build({entryPoints:[path.join(root,'test/fixtures/platformer-recipe/main.ts')],bundle:true,write:false,
        format:'esm',platform:'browser',target:'es2022',external:['cocosair']});
    const pw=require('playwright'), server=await startExampleServer(root);
    try {
        for (const engine of engines) {
            let browser, probe, keyboard, paused, cleanup, version; const errors=[];
            try {
                browser=await pw[engine].launch({...launchOptions(engine),headless:true}); version=browser.version();
                const page=await browser.newPage({viewport:{width:320,height:192},deviceScaleFactor:2});
                page.on('pageerror',(error)=>errors.push(String(error)));
                await page.route('**/main.ts',(route)=>route.fulfill({contentType:'text/javascript',body:built.outputFiles[0].text}));
                await page.goto(server.origin+'/test/fixtures/platformer-recipe/');
                await page.waitForFunction(()=>window.__platformerProbe?.ready,null,{timeout:45000});
                probe=await page.evaluate(()=>window.__platformerProbe.snapshot()); console.error(JSON.stringify({engine,probe})); checkScenario(probe);
                await page.locator('#GameCanvas').click({position:{x:280,y:130}});
                const before=await page.evaluate(()=>window.__platformerProbe.live());
                await page.keyboard.down('KeyD'); await page.waitForTimeout(150);
                const down=await page.evaluate(()=>window.__platformerProbe.live()); await page.keyboard.up('KeyD');
                keyboard={before,down}; assert(down.vx>60 && down.x>before.x+3 && down.inputEvents>before.inputEvents);
                await page.evaluate(()=>window.__platformerProbe.pause());
                const pauseBefore=await page.evaluate(()=>window.__platformerProbe.live()); await page.keyboard.down('Space'); await page.waitForTimeout(150); await page.keyboard.up('Space');
                const pauseAfter=await page.evaluate(()=>window.__platformerProbe.live()); paused={before:pauseBefore,after:pauseAfter};
                for(const key of ['x','y','vx','vy','fixedSteps']) assert.equal(pauseBefore[key],pauseAfter[key]); assert(pauseAfter.renderedFrames>pauseBefore.renderedFrames); assert.equal(pauseAfter.inputEvents,pauseBefore.inputEvents,'paused controls are not admitted');
                const restarted=await page.evaluate(()=>window.__platformerProbe.restart()); assert(restarted.grounded); assert(Math.abs(restarted.x-probe.playerSpawn.x)<1);
                await page.screenshot({path:path.join(artifacts,engine+'.png')});
                cleanup=await page.evaluate(()=>window.__platformerProbe.cleanup()); assert.equal(cleanup.receipt.status,'released'); assert.deepEqual(cleanup.receipt.pending,[]); assert.deepEqual(cleanup.receipt.failures,[]);
                assert.equal(cleanup.receipt.completed.length,1); assert.match(cleanup.receipt.completed[0],/^platformer-assets#\d+$/);
                const terminal=await page.evaluate(()=>{ const api=window.__platformerProbe; const same=api.cleanup()===api.cleanup(); let error; try{api.resume();}catch(e){error=String(e);} return {same,error}; });
                assert.equal(terminal.same,true); assert.match(terminal.error,/PLATFORMER_DISPOSED/);
                cleanup.terminal=terminal;
                assert.equal(cleanup.rafId,null); assert.equal(cleanup.liveRunning,false); assert.equal(cleanup.disposed,true); assert.equal(cleanup.enginePaused,true);
                assert(cleanup.valid.length>=8 && cleanup.valid.every((v)=>v===false)); assert(cleanup.loadedRefs.every((v)=>v===0));
                await page.keyboard.down('KeyD'); await page.waitForTimeout(100); await page.keyboard.up('KeyD');
                const retired=await page.evaluate(()=>window.__platformerProbe.live());
                for(const key of ['fixedSteps','renderedFrames','inputEvents']) assert.equal(retired[key],cleanup.after[key],'retired input/rAF must be inert');
                assert.deepEqual(errors,[]);
                results.push({engine,status:'PASS',version,probe,keyboard,paused,cleanup,retired,errors,
                    screenshot:path.relative(root,path.join(artifacts,engine+'.png'))});
            } catch(error) {results.push({engine,status:'FAIL',version,probe,keyboard,paused,cleanup,errors,error:String(error.stack||error)});}
            finally {await browser?.close();}
            fs.writeFileSync(path.join(artifacts,engine+'.log'),JSON.stringify(results.at(-1),null,2)+'\n');
            console.error(JSON.stringify({engine,status:results.at(-1).status,error:results.at(-1).error}));
        }
        for(const f of files) assert.equal(hash(f),fingerprints[f],'candidate drift: '+f);
        const scopePassed=results.length===engines.length && results.every((v)=>v.status==='PASS');
        fs.writeFileSync(output,JSON.stringify({schemaVersion:'air-platformer-recipe/1',startedAt,endedAt:new Date().toISOString(),command:process.argv,cwd:root,
            method:'REAL_BROWSER',playwrightVersion:require('playwright/package.json').version,fingerprints,scopePassed,subset:true,completed:false,
            scope:['TMX/TSX/PNG native map and tile colliders','Box2D µ=0.2 friction, velocity unit conversion and released air controls',
                'one-way PRE_SOLVE pass through then stable upward-normal support; wall/queries negatives','single paused-engine accumulator, rendered pause and restart',
                'trusted Playwright keyboard → native PAL/input; teardown removes listeners, cancels rAF and releases assets'],
            limitations:['Scripted scenario sets the same gameplay state directly; trusted keyboard is checked separately','No original external app/assets for 1:1 comparison','GPU memory unavailable','Not complete 35-item or release readiness'],results},null,2)+'\n',{flag:'wx'});
        process.exitCode=scopePassed?0:1;
    } finally {await server.close();}
}
if(require.main===module) main().catch((error)=>{console.error(error);process.exitCode=1;});
module.exports={checkScenario};
