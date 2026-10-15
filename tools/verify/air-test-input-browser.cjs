const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'),crypto=require('node:crypto'),esbuild=require('esbuild');
const {startExampleServer}=require('./competitive-example-server.cjs'),{launchOptions}=require('./browser-engines.cjs');
const root=path.resolve(__dirname,'../..'),hash=(f)=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
async function main(){
    assert(process.argv[2]?.startsWith('--out='),'--out=<new.json> required');
    const out=path.resolve(root,process.argv[2].slice(6));assert(!fs.existsSync(out),'new report required');
    const playwright=require('playwright'),startedAt=new Date().toISOString(),results=[];
    const files=['build/cocosair.module.js', 'src/air/action-input.ts', 'src/air/step-clock.ts', 'src/cocos/input/input.ts', 'tools/debug/test-input.ts', 'tools/verify/air-test-input-browser.cjs', 'tools/verify/browser-engines.cjs', 'test/fixtures/test-input/index.html', 'test/fixtures/test-input/main.ts'];
    const fingerprints=Object.fromEntries(files.map((f)=>[f,hash(f)]));
    const built=esbuild.buildSync({entryPoints:[path.join(root,'test/fixtures/test-input/main.ts')],bundle:true,write:false,format:'esm',target:'es2022',external:['/build/*']});
    const server=await startExampleServer(root);
    try{
        for(const engine of ['chromium','firefox','webkit']){
            let browser,synthetic,real,release;
            try{
                browser=await playwright[engine].launch({...launchOptions(engine),headless:true});
                const page=await browser.newPage({viewport:{width:480,height:360},hasTouch:true}),errors=[];
                page.on('pageerror',(e)=>errors.push(String(e)));
                await page.route('**/main.ts',(r)=>r.fulfill({contentType:'text/javascript',body:built.outputFiles[0].text}));
                await page.goto(server.origin+'/test/fixtures/test-input/');await page.waitForFunction(()=>window.__testInputProbe?.ready);
                synthetic=await page.evaluate(async()=>{
                    const p=window.__testInputProbe;const before=p.snapshot();
                    const a={id:11,clientX:240,clientY:180},b={id:12,clientX:420,clientY:300};
                    const key=p.key('down','KeyA');p.key('down','KeyA');
                    const contact=p.touch('start',[a,b]);const held=p.snapshot();
                    p.touch('end',[a]);const peer=p.snapshot();
                    const first=await p.step(),afterStep=p.snapshot();p.touch('cancel',[b]);
                    p.key('up','KeyA');const edges=p.tick();const after=p.snapshot();
                    p.touch('start',[a]);p.key('down','KeyA');p.dispose();p.dispose();
                    const disposed=p.snapshot();let terminal;try{p.key('down','KeyA');}catch(e){terminal=e.code;}
                    return {before,key,contact,held,peer,first,afterStep,after,edges,disposed,terminal};
                });
                assert.equal(synthetic.key.isTrusted,false);assert.equal(synthetic.key.method,'SYNTHETIC');
                assert.equal(synthetic.held.updates,synthetic.before.updates,'input injection has no second clock');
                assert.equal(synthetic.held.held,true);assert.equal(synthetic.held.counts.keyDown,1,'PAL repeat maps to KEY_PRESSING');
                assert.equal(synthetic.held.counts.nodeStart,1);assert.equal(synthetic.held.counts.globalStart,1,'UI swallows only its own changed touch');
                assert.deepEqual(synthetic.peer.activeIds,[12]);assert.equal(synthetic.peer.pointers.length,1);
                assert.equal(synthetic.first.afterDraw,true);assert.equal(synthetic.afterStep.updates,synthetic.before.updates+1);
                assert.equal(synthetic.afterStep.moves,1/60);assert.equal(synthetic.after.held,false);
                assert.equal(synthetic.after.counts.nodeEnd,1);assert.equal(synthetic.after.counts.globalCancel,1);
                assert.equal(synthetic.disposed.counts.nodeCancel,1);assert.equal(synthetic.disposed.held,false);
                assert.deepEqual(synthetic.disposed.activeIds,[]);assert.equal(synthetic.terminal,'AIR_E_TEST_INPUT_DISPOSED');
                assert(synthetic.disposed.raw.every((e)=>!e.isTrusted));
                await page.evaluate(()=>{window.__testInputProbe.resetCounts();window.__testInputProbe.focus();});
                await page.keyboard.down('a');await page.keyboard.up('a');
                await page.touchscreen.tap(240,180);real=await page.evaluate(()=>window.__testInputProbe.snapshot());
                assert.equal(real.counts.keyDown,1);assert.equal(real.counts.keyUp,1);assert.equal(real.counts.nodeStart,1);assert.equal(real.counts.nodeEnd,1);
                assert(real.raw.some((e)=>e.type==='touchstart'&&e.isTrusted),'real browser protocol touch compared separately');
                assert(real.raw.some((e)=>e.type==='keydown'&&e.isTrusted),'real browser protocol keyboard compared separately');
                release=await page.evaluate(()=>window.__testInputProbe.release());assert.equal(release.status,'released');assert.deepEqual(errors,[]);
                results.push({engine,status:'PASS',browserVersion:browser.version(),synthetic,real,release});
            }catch(error){results.push({engine,status:'FAIL',synthetic,real,release,error:String(error.stack||error)});}
            finally{if(browser)await browser.close();}
            console.error('[test-input] '+JSON.stringify(results.at(-1)));
        }
        for(const file of files)assert.equal(hash(file),fingerprints[file],'candidate drift: '+file);
        const passed=results.length===3&&results.every((r)=>r.status==='PASS');
        fs.writeFileSync(out,JSON.stringify({startedAt,endedAt:new Date().toISOString(),command:process.argv,cwd:root,scope:['PG-15 opt-in DOM_PAL synthetic input, original UI/global dispatch, repeat, multitouch cancellation, deterministic single step and balanced dispose','Separate trusted protocol keyboard/touch comparison'],subset:true,completed:false,scopePassed:passed,
            limitations:['Synthetic input bypasses physical canvas focus admission','Browser protocol isTrusted is not physical hardware certification','No background-tab/OS input or complete mixed-device certification'],fingerprints,results},null,2)+'\n',{flag:'wx'});process.exitCode=passed?0:1;
    }finally{await server.close();}
}
main().catch((e)=>{console.error(e);process.exitCode=1;});
