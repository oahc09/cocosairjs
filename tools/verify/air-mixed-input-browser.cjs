const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {startExampleServer}=require('./competitive-example-server.cjs'),{launchOptions}=require('./browser-engines.cjs');
const root=path.resolve(__dirname,'../..'),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
async function main(){
    const out=process.argv.find(v=>v.startsWith('--out='))?.slice(6);assert(out,'--out required');const output=path.resolve(root,out);assert(!fs.existsSync(output),'new report required');
    const bundle=process.argv.find(v=>v.startsWith('--bundle='))?.slice(9)??'build/cocosair.module.js';assert(path.resolve(root,bundle).startsWith(root+path.sep));
    const startedAt=new Date().toISOString(),files=[bundle,'src/air/action-input.ts','src/air/action-state.ts','tools/debug/test-input.ts','test/fixtures/mixed-input/main.ts','test/fixtures/mixed-input/index.html','tools/verify/air-mixed-input-browser.cjs','tools/verify/installed-atlas-package.cjs'];
    const fingerprints=Object.fromEntries(files.map(f=>[f,hash(f)]));
    const installed=process.argv.includes('--installed')?await require('./installed-atlas-package.cjs').prepareInstalledAtlas(root):null;
    const sdkPath=installed?'/installed/runtime.js':'/'+bundle;
    const built=await require('esbuild').build({entryPoints:[path.join(root,'test/fixtures/mixed-input/main.ts')],bundle:true,write:false,format:'esm',target:'es2022',alias:{cocosair:sdkPath},external:[sdkPath]});
    const server=await startExampleServer(root),pw=require('playwright'),results=[];
    try{for(const engine of ['chromium','firefox','webkit']){let browser;
        try{browser=await pw[engine].launch({...launchOptions(engine),headless:true});
        for(const backend of ['native','dom'])for(const canvas of ['default','custom']){let page,context;const checks=[];let observation;
            try{context=await browser.newContext({viewport:{width:560,height:360},hasTouch:true});page=await context.newPage();const errors=[],requests=[];page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>requests.push(new URL(r.url()).pathname));
                if(installed)await page.route(url=>url.pathname.startsWith('/installed/')&&url.pathname.endsWith('.js'),route=>{
                    const body=installed.contents.get(new URL(route.request().url()).pathname);return body?route.fulfill({contentType:'text/javascript',body}):route.abort();
                });
                await page.route('**/main.ts',r=>r.fulfill({contentType:'text/javascript',body:built.outputFiles[0].text}));
                await page.goto(`${server.origin}/test/fixtures/mixed-input/?backend=${backend}&canvas=${canvas}`);await page.waitForFunction(()=>window.__mixed?.ready,null,{timeout:60000});
                const snap=()=>page.evaluate(()=>window.__mixed.snapshot()),tick=()=>page.evaluate(()=>window.__mixed.tick());
                await page.locator('#start').click();await page.keyboard.down('Space');await tick();
                await page.mouse.move(400,260);await page.mouse.down();const mouse=await snap();assert.equal(mouse.pointers.length,1);assert.equal(mouse.counts.mouseDown,1);assert.equal(mouse.counts.globalStart,1);
                const injected=await page.evaluate(()=>window.__mixed.points('start',[11,12]));const mixed=await snap();
                assert.equal(injected.isTrusted,false);assert.equal(mixed.pointers.length,backend==='native'?2:3);
                if(backend==='native'){assert.equal(mixed.counts.uiStart,1);assert.equal(mixed.counts.globalStart,2);assert(!mixed.pointers.some(s=>s.pointerId===11));}
                await page.evaluate(()=>window.__mixed.points('cancel',[11]));assert.equal((await snap()).pointers.length,backend==='native'?2:2);
                await page.mouse.move(530,260);await page.mouse.up();const afterMouse=await snap();assert.equal(afterMouse.pointers.length,1);assert.equal(afterMouse.pointers[0].pointerId,12);assert(afterMouse.held);
                await page.evaluate(()=>window.__mixed.points('cancel',[12]));const afterCancel=await snap();assert.equal(afterCancel.pointers.length,0);assert(afterCancel.held);
                await page.keyboard.up('Space');assert.equal((await snap()).held,false);await tick();checks.push({kind:'trusted keyboard/mouse + synthetic two-contact cancel',mouse,mixed,afterMouse,afterCancel,injected});
                await page.locator('#start').click();await page.keyboard.down('Space');await page.locator('#hud').click();assert((await snap()).held);await page.keyboard.up('Space');assert.equal((await snap()).held,false);checks.push({kind:'HUD focus keeps keyboard owner'});
                await page.locator('#editable').focus();await page.keyboard.type('a');assert.equal((await snap()).held,false);assert.equal(await page.locator('#editable').inputValue(),'a');
                await page.locator('#start').click();await page.keyboard.down('Space');await page.locator('#editable').focus();await page.keyboard.up('Space');assert.equal((await snap()).held,false);checks.push({kind:'editable admission and held key release'});
                await page.locator('#start').click();await tick();for(let n=0;n<100;n++)await page.keyboard.down('Space');const repeat=await tick();assert.equal(repeat.transitions.filter(e=>e.action==='fire'&&e.kind==='press').length,1);await page.keyboard.up('Space');await tick();checks.push({kind:'100 trusted repeats, single press'});
                const initialGeneration=(await snap()).generation;await page.evaluate(()=>{for(let n=0;n<100;n++){window.__mixed.reset('restart');window.__mixed.activate();}});assert.equal((await snap()).generation,initialGeneration+100);
                await page.keyboard.down('Space');assert((await snap()).held);await page.keyboard.up('Space');checks.push({kind:'100 reset/generation cycles preserve input'});
                await page.locator('#start').click();await page.keyboard.down('Space');const other=await page.context().newPage();await other.goto('about:blank');await other.bringToFront();
                const background=await snap();await page.bringToFront();const foreground=await snap();await other.close();await page.keyboard.up('Space');
                if(background.hidden)assert.equal(background.held,false);
                if(background.raw.some(e=>e.type==='blur'&&e.isTrusted))assert.equal(background.held,false);
                checks.push({kind:'actual background-tab observation',background,foreground,status:background.hidden?'PASS':'NOT_RUN',reason:background.hidden?undefined:'Headless automation did not place this page in hidden state'});
                await page.locator('#start').click();await page.keyboard.down('Space');await page.evaluate(()=>window.__mixed.syntheticBlur());const blur=await snap();assert.equal(blur.held,false);assert.equal(blur.reset.reason,'blur');await page.keyboard.up('Space');
                await page.keyboard.down('Space');await page.evaluate(()=>window.__mixed.syntheticHidden());const hidden=await snap();assert.equal(hidden.held,false);assert.equal(hidden.reset.reason,'hidden');await page.keyboard.up('Space');checks.push({kind:'synthetic blur/hidden contract',method:'SYNTHETIC',blur,hidden});
                const receipt=await page.evaluate(()=>window.__mixed.release());assert.equal(receipt.status,'released');await tick();await page.keyboard.down('Space');await page.keyboard.up('Space');assert.equal((await tick()).transitions.length,0);assert.equal((await snap()).attached,false);assert.deepEqual(errors,[]);
                if(installed){assert(requests.includes('/installed/runtime.js'));assert(!requests.some(p=>p.startsWith('/build/')),'workspace runtime substituted for installed package');}
                observation={snapshot:await snap(),receipt,errors,requests};results.push({engine,backend,canvas,status:'PASS',version:browser.version(),checks,observation});
            }catch(e){results.push({engine,backend,canvas,status:'FAIL',checks,observation,snapshot:await page?.evaluate(()=>window.__mixed?.snapshot()).catch(()=>null),error:String(e.stack||e)});}
            finally{await context?.close();}console.error(JSON.stringify({engine,backend,canvas,status:results.at(-1).status,error:results.at(-1).error}));
        }}finally{await browser?.close();}}
        for(const f of files)assert.equal(hash(f),fingerprints[f],'candidate drift: '+f);const passed=results.length===12&&results.every(r=>r.status==='PASS');
        fs.writeFileSync(output,JSON.stringify({startedAt,endedAt:new Date().toISOString(),command:process.argv,cwd:root,method:'REAL_BROWSER_WITH_EXPLICIT_SYNTHETIC_CONTACTS',subset:true,completed:false,scopePassed:passed,fingerprints,installed:installed?.identity??null,results,
            limitations:['Two simultaneous contacts and cancellation are synthetic DOM events through production listeners; physical multitouch not certified','Trusted protocol mouse/key are separate measured sources','Actual hidden only credited if document.hidden changes; synthetic hidden is never upgraded']},null,2)+'\n',{flag:'wx'});process.exitCode=passed?0:1;
    }finally{await server.close();installed?.cleanup();}
}main().catch(e=>{console.error(e);process.exitCode=1;});
