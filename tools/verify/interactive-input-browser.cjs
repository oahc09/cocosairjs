'use strict';
// IER-05: trusted protocol input, raw model/frame traces and independently decoded compositor PNGs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PNG}=require('pngjs');
const ROOT=path.resolve(__dirname,'../..');
const INPUTS=['build/cocosair.module.js','build/cocosair.module.d.ts','examples/interactive-input/index.html','examples/interactive-input/src/main.ts','tools/verify/interactive-input-browser.cjs','tools/verify/interactive-input-browser.tsconfig.json','tools/verify/browser-engines.cjs','tools/verify/competitive-example-server.cjs'];
const ENGINES=['chromium','firefox','webkit'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const fp=p=>{const b=fs.readFileSync(path.resolve(ROOT,p));return {path:p,sha256:hash(b),bytes:b.length}};
const finite=Number.isFinite;
const safe=v=>Number.isSafeInteger(v)&&v>=0;
function expectedCenter(s){
 const l=s.layout,x=((s.activations+s.dragCommits)%5-2)*.25,y=(s.rangeValue-50)/100;
 if(s.control)return {x:l.rect.left+(45+x*15)/100*l.css.width+24,y:l.rect.top+140};
 const m=s.camera?.viewProjection;if(!Array.isArray(m)||m.length!==16||!m.every(finite))throw Error('camera matrix missing');
 const w=m[3]*x+m[7]*y+m[15];if(!finite(w)||Math.abs(w)<1e-8)throw Error('projection invalid');
 return {x:l.rect.left+((m[0]*x+m[4]*y+m[12])/w+1)/2*l.css.width,y:l.rect.top+(1-(m[1]*x+m[5]*y+m[13])/w)/2*l.css.height};
}
function pixels(png,s){
 const l=s.layout,d=s.layout.dpr,r=l.rect,c=l.css;let count=0,xSum=0,ySum=0;
 if(![d,r.left,r.top,c.width,c.height].every(finite)||d<=0||c.width<=0||c.height<=0)throw Error('layout invalid');
 if(png.width!==Math.round(l.viewport.width*d)||png.height!==Math.round(l.viewport.height*d))throw Error('PNG viewport mismatch');
 for(let y=Math.max(0,Math.ceil(r.top*d));y<Math.min(png.height,Math.floor((r.top+c.height)*d));y++)for(let x=Math.max(0,Math.ceil(r.left*d));x<Math.min(png.width,Math.floor((r.left+c.width)*d));x++){
 const i=(y*png.width+x)*4;if(png.data[i]>130&&png.data[i]>png.data[i+1]*1.8&&png.data[i]>png.data[i+2]*1.8&&png.data[i+3]===255){count++;xSum+=x+.5;ySum+=y+.5}}
 const center=expectedCenter(s);return {count,centroid:count?{x:xSum/count/d,y:ySum/count/d}:null,expected:center,error:count?Math.hypot(xSum/count/d-center.x,ySum/count/d-center.y):Infinity};
}
function checkOperation(row,read=fs.readFileSync){
 const errors=[];try{
 const a=row.before,b=row.after;if(row.result!=='PASS')errors.push('operation not PASS');
 if(!a||!b||!['button-mouse','button-touch','canvas-mouse','canvas-touch'].includes(row.kind))throw Error('operation shape');
 const button=row.kind.startsWith('button'),key=button?'activations':'dragCommits',other=button?'dragCommits':'activations';
 if(!safe(a[key])||!safe(b[key])||b[key]-a[key]!==1||b[other]!==a[other]||b.visibleUpdates-a.visibleUpdates!==1)errors.push('one gesture must yield one model/visible update');
 if(b.frame<=a.frame||b.generation!==a.generation||b.activePointers.length!==0)errors.push('frame/generation/contact mismatch');
 const matching=b.events.filter(e=>e.sequence>a.latest.sequence&&e.type===(button?'activate':'pointerup')&&(button||e.owner==='canvas'&&e.accepted===true));
 if(matching.length!==1||matching[0].isTrusted!==true||!safe(matching[0].sequence))errors.push('trusted physical event mismatch');
 if(button&&!b.events.some(e=>e.type==='button-contact'&&e.sequence>a.latest.sequence&&e.isTrusted===true&&e.generation===b.generation&&e.sequence<matching[0]?.sequence&&e.pointerType===(row.kind.endsWith('touch')?'touch':'mouse')))errors.push('button contact type mismatch');
 if(!button&&(!b.events.some(e=>e.type==='pointerdown'&&e.sequence>a.latest.sequence&&e.pointerType===(row.kind.endsWith('touch')?'touch':'mouse')&&e.isTrusted===true)||!b.events.some(e=>e.type==='pointermove'&&e.sequence>a.latest.sequence)))errors.push('drag must contain actual pointer motion');
 if(!safe(b.submitted?.submittedSequence)||b.submitted.submittedSequence<b.latest.sequence||b.submitted.submittedSequence>b.submitted.receivedSequence||!safe(b.submitted.totalFrames)||b.submitted.totalFrames<=a.submitted.totalFrames||!finite(Date.parse(b.submitted.timestamp)))errors.push('submitted frame missing/out of order');
 const x=((b.activations+b.dragCommits)%5-2)*.25,y=(b.rangeValue-50)/100;
 if(!b.control&&(!b.actor?.meshBound||b.actor.x!==x||Math.abs(b.actor.y-y)>1e-6))errors.push('native pose does not match model');
 const bytes=read(path.resolve(ROOT,row.png.path));if(bytes.length!==row.png.bytes||hash(bytes)!==row.png.sha256)errors.push('PNG identity drift');
 const v=pixels(PNG.sync.read(bytes),b);if(v.count<300||v.error>2)errors.push('visible marker absent/wrong position');
 return {ok:errors.length===0,errors,visibility:v};
 }catch(e){errors.push(String(e.message));return {ok:false,errors}}
}
function checkSupplementary(r){
 const errors=[];try{const s=r.stages,get=n=>s.find(x=>x.name===n)?.snapshot,need=n=>{const v=get(n);if(!v)throw Error('missing '+n);return v};
 const before=need('before'),after=need('after');
 switch(r.kind){
 case 'keyboard': if(after.activations-before.activations!==3||r.focusAfterTab!=='reset'||!after.labelIdentityStable||after.textReplacements!==before.textReplacements)errors.push('held/Enter/Space/Tab/stable label');break;
 case 'rewrite': if(need('rewriting').textReplacements<=before.textReplacements||need('rewriting').labelIdentityStable!==false)errors.push('per-frame DOM replacement not observed');break;
 case 'hover': if(after.hoverMoves<=before.hoverMoves||!after.events.some(e=>e.sequence>before.latest.sequence&&e.type==='hover'&&e.isTrusted===true)||Date.parse(after.latest.timestamp)-Date.parse(before.latest.timestamp)>=700)errors.push('immediate hover unavailable');break;
 case 'leave':case 'reset':case 'mode':case 'resize':case 'range-cancel':case 'cancel':case 'multitouch':case 'blur':case 'hidden': {
 const retired=need('retired'),late=need('late'),fresh=need('fresh');
 if(retired.generation<=before.generation||retired.activePointers.length||retired.heldSources.length||late.dragCommits!==retired.dragCommits||late.rangeCommits!==retired.rangeCommits||fresh.dragCommits-late.dragCommits!==1)errors.push('session cancellation/late release/fresh gesture');
 if(r.kind==='range-cancel'&&late.rangeValue!==retired.rangeValue)errors.push('late range value changed');
 if(!retired.events.some(e=>e.sequence>before.latest.sequence&&e.isTrusted===true&&e.type===(r.kind==='range-cancel'?'reset':r.kind==='multitouch'?'cancel':r.kind)))errors.push('real retirement event missing');
 if(r.kind==='multitouch'&&(need('held').activePointers.length!==2||!before.control&&need('held').heldSources.length!==2))errors.push('two touch identities missing');break;}
 case 'wheel': {
 const vertical=need('vertical');const wheel=vertical.events.findLast(e=>e.type==='wheel');const horizontal=after.events.findLast(e=>e.type==='wheel');
 if(!wheel?.isTrusted||wheel.owner!=='document'||wheel.consumed||wheel.deltaMode!==0||wheel.units!==-wheel.deltaY*5||vertical.scrollY-before.scrollY!==wheel.deltaY)errors.push('vertical wheel must scroll once in CSS pixel units');
 if(!horizontal?.isTrusted||horizontal.owner!=='rail'||!horizontal.consumed||horizontal.units!==-horizontal.deltaX*5||after.scrollY!==vertical.scrollY||after.railUnits-vertical.railUnits!==horizontal.units||after.rangeValue===vertical.rangeValue)errors.push('horizontal rail ownership');break;}
 case 'touch-scroll': if(after.scrollY<=before.scrollY||after.railUnits!==before.railUnits||!after.events.some(e=>e.sequence>before.latest.sequence&&e.type==='rail-touch'&&e.phase==='touchstart'&&e.isTrusted===true&&e.contacts.length===1))errors.push('native vertical touch scrolling');break;
 case 'button-cancel': if(need('late').activations!==before.activations||after.activations-before.activations!==1||!need('late').events.some(e=>e.sequence>before.latest.sequence&&e.type==='button-cancel'&&e.isTrusted===true&&e.pointerType==='touch'))errors.push('cancelled touch click/fresh click');break;
 default:throw Error('unknown supplementary case');
 }
 if(after.events.some(e=>!safe(e.sequence)||!finite(Date.parse(e.timestamp))))errors.push('event sequence/timestamp');
 }catch(e){errors.push(e.message)}return {ok:errors.length===0,errors};
}
function checkReport(report,{verifyInputs=true}={}){
 const errors=[],notRun=[];try{
 if(report.schemaVersion!=='ier-input/1'||report.sourceStatus!=='recreated'||report.referenceComparison?.result!=='NOT_RUN'||report.subset!==true||report.completed!==false)errors.push('scope/provenance');
 if(verifyInputs)for(const p of INPUTS){const current=fp(p),recorded=report.fingerprints.find(x=>x.path===p);if(!recorded||current.bytes!==recorded.bytes||current.sha256!==recorded.sha256)errors.push('input drift '+p)}
 if(!Array.isArray(report.rows)||report.rows.length!==6||new Set(report.rows.map(r=>r.engine+'/'+r.control)).size!==6)errors.push('engine/control matrix');
 for(const engine of ENGINES)for(const control of [false,true]){
 const r=report.rows.find(r=>r.engine===engine&&r.control===control);if(!r){errors.push('missing row '+engine+'/'+control);continue}
 if(!r.version||r.pageErrors.length||r.consoleErrors.length||control&&r.sdkRequests.length||!control&&r.sdkRequests.length!==1)errors.push('browser/isolation/errors '+engine+'/'+control);
 for(const kind of ['button-mouse','button-touch','canvas-mouse',...(engine==='chromium'?['canvas-touch']:[])]){
 const ops=r.operations.filter(o=>o.kind===kind);if(ops.length!==20||new Set(ops.map(o=>o.index)).size!==20||ops.some((o,i)=>o.index!==i))errors.push('20-action coverage '+engine+'/'+control+'/'+kind);
 for(const op of ops){if(op.engine!==engine||op.control!==control)errors.push('case identity');const v=checkOperation(op);errors.push(...v.errors.map(x=>engine+'/'+control+'/'+kind+'/'+op.index+': '+x))}
 }
 const required=['keyboard','rewrite','hover','leave','reset','mode','resize','range-cancel','wheel',...(engine==='chromium'?['multitouch','cancel','button-cancel','touch-scroll']:[])];
 for(const kind of required){const cases=r.supplementary.filter(x=>x.kind===kind);if(cases.length!==1)errors.push('missing/duplicate supplementary '+kind);else errors.push(...checkSupplementary(cases[0]).errors.map(x=>engine+'/'+control+'/'+kind+': '+x))}
 const expectedOperations=engine==='chromium'?80:60;if(r.operations.length!==expectedOperations)errors.push('unexpected operation count');
 for(let i=1;i<r.operations.length;i++){const previous=r.operations[i-1].after,next=r.operations[i].before;for(const k of ['activations','dragCommits','visibleUpdates'])if(previous[k]!==next[k])errors.push('model continuity '+k);}
 const expectedSkipped=engine==='chromium'?[]:['canvas-touch-drag-20','multitouch','cancel','button-cancel','touch-scroll'];
 for(const caseId of expectedSkipped)if(r.notRun.filter(n=>n.caseId===caseId).length!==1)errors.push('missing NOT_RUN '+caseId);
 for(const kind of ['blur','hidden'])if(r.notRun.filter(n=>n.caseId===kind).length+r.supplementary.filter(n=>n.kind===kind).length!==1)errors.push('focus/visibility coverage '+kind);
 for(const item of r.notRun){if(!item.reason||!item.caseId)errors.push('NOT_RUN needs reason');notRun.push({...item,engine,control})}
 const release=r.release;if(release?.samePromise!==true||!release.receipt?.disposed||!release.receipt.listenersDetached||!release.receipt.inputDetached||release.eventsAfter!==release.eventsBefore||release.frameAfter!==release.frameBefore||release.receipt.refs.length!==(control?0:2)||release.receipt.refs.some(x=>x.before!==1||x.after!==0)||!release.controlsDisabled)errors.push('release '+engine+'/'+control);
 }
 }catch(e){errors.push(e.message)}return {valid:errors.length===0,scopePassed:errors.length===0&&notRun.length===0,errors,notRun};
}
async function main(){
 const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return [a.slice(2,i<0?undefined:i),i<0?true:a.slice(i+1)]}));
 if(args.verify){const report=JSON.parse(fs.readFileSync(args.verify));const v=checkReport(report);console.log(JSON.stringify(v,null,2));process.exitCode=v.scopePassed?0:1;return}
 if(!args.out)throw Error('--out=<new.json> required');const out=path.resolve(args.out);if(fs.existsSync(out))throw Error('output exists');const artifacts=out.replace(/\.json$/,'')+'-artifacts';fs.mkdirSync(artifacts,{recursive:true});
 const report={schemaVersion:'ier-input/1',startedAt:new Date().toISOString(),executionChannel:'Lead',command:process.argv.join(' '),cwd:ROOT,sourceStatus:'recreated',referenceComparison:{result:'NOT_RUN',reason:'Original private mixed-input recordings were not supplied'},subset:true,completed:false,method:'REAL_BROWSER',fingerprints:INPUTS.map(fp),rows:[],limitations:['Playwright trusted browser protocol inputs; physical touchscreen hardware and assistive technology hardware NOT_RUN','Firefox/WebKit expose touchscreen tap but no Playwright multi-contact move/cancel protocol; these cases are NOT_RUN','AFTER_DRAW is submission; PNG is compositor observation, neither is physical display time']};
 const server=await require('./competitive-example-server.cjs').startExampleServer(ROOT),pw=require('playwright');
 try{for(const engine of ENGINES){const browser=await pw[engine].launch({...require('./browser-engines.cjs').launchOptions(engine),headless:true});try{
 for(const control of [false,true]){
 const context=await browser.newContext({viewport:{width:900,height:850},hasTouch:true,deviceScaleFactor:1}),page=await context.newPage();page.setDefaultTimeout(6000);
 const row={engine,control,version:browser.version(),operations:[],supplementary:[],notRun:[],pageErrors:[],consoleErrors:[],sdkRequests:[]};report.rows.push(row);
 page.on('pageerror',e=>row.pageErrors.push(String(e)));page.on('console',m=>{if(m.type()==='error')row.consoleErrors.push(m.text())});page.on('request',r=>{if(new URL(r.url()).pathname==='/build/cocosair.module.js')row.sdkRequests.push(r.url())});
 const snap=()=>page.evaluate(()=>window.__mixedInput.snapshot());
 const settle=()=>page.waitForFunction(()=>{const s=window.__mixedInput.snapshot();return s.frame>2&&s.submitted.submittedSequence===s.submitted.receivedSequence},null,{polling:20});
 const box=async id=>{const b=await page.locator(id).boundingBox();if(!b)throw Error('missing '+id);return b};
 const drag=async()=>{const b=await box('#GameCanvas');await page.mouse.move(b.x+100,b.y+100);await page.mouse.down();await page.mouse.move(b.x+150,b.y+110,{steps:3});await page.mouse.up();await settle()};
 let cdp=null;const touch=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(p=>({id:p.id,x:p.x,y:p.y,radiusX:2,radiusY:2,force:1}))});
 try{
 await page.goto(server.origin+'/examples/interactive-input/'+(control?'?control=html':''));await page.waitForFunction(()=>window.__mixedInput,null,{polling:50});await settle();if(engine==='chromium')cdp=await context.newCDPSession(page);
 const capture=async(kind,index,before)=>{await settle();const after=await snap(),p=path.join(artifacts,`${engine}-${control?'html':'sdk'}-${kind}-${index}.png`);await page.screenshot({path:p});const bytes=fs.readFileSync(p);const op={engine,control,kind,index,before,after,png:{path:path.relative(ROOT,p).replace(/\\/g,'/'),bytes:bytes.length,sha256:hash(bytes)},result:'PASS',observationTimestamp:new Date().toISOString()};row.operations.push(op);const v=checkOperation(op);if(!v.ok)op.result='FAIL';};
 for(const kind of ['button-mouse','button-touch','canvas-mouse',...(cdp?['canvas-touch']:[])])for(let index=0;index<20;index++){
 const before=await snap();if(kind==='button-mouse')await page.locator('#activate').click();else if(kind==='button-touch')await page.locator('#activate').tap();else if(kind==='canvas-mouse')await drag();else {const b=await box('#GameCanvas');await touch('touchStart',[{id:1,x:b.x+100,y:b.y+100}]);await touch('touchMove',[{id:1,x:b.x+150,y:b.y+110}]);await touch('touchEnd',[])}await capture(kind,index,before);
 }
 async function supplementary(kind,fn){const stages=[],save=async name=>{await settle();const snapshot=await snap();stages.push({name,snapshot});return snapshot};await save('before');const extra=await fn(save);await save('after');const r={kind,stages,...extra};row.supplementary.push(r);console.log(engine,(control?'html':'sdk'),kind,JSON.stringify(checkSupplementary(r)));}
 await supplementary('keyboard',async()=>{const b=await box('#activate');await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.waitForTimeout(250);await page.mouse.up();await page.locator('#activate').focus();await page.keyboard.press('Enter');await page.keyboard.press('Space');await page.keyboard.press('Tab');return {focusAfterTab:await page.evaluate(()=>document.activeElement.id)}});
 await supplementary('rewrite',async save=>{await page.locator('#rewrite').check();await page.waitForTimeout(120);await page.locator('#activate').click();await page.waitForTimeout(80);await save('rewriting');await page.locator('#rewrite').uncheck()});
 await supplementary('hover',async()=>{const b=await box('#GameCanvas');await page.mouse.move(b.x+200,b.y+100)});
 async function cancelMouse(kind,save){const b=await box(kind==='range-cancel'?'#range':'#GameCanvas');await page.mouse.move(b.x+b.width*.4,b.y+b.height*.5);await page.mouse.down();await save('held');if(kind==='leave')await page.mouse.move(b.x-20,b.y);else if(kind==='resize'){const generation=(await snap()).generation;await page.setViewportSize({width:880,height:850});await page.waitForFunction(g=>window.__mixedInput.snapshot().generation>g,generation,{polling:20})}else {await page.locator(kind==='mode'?'#mode':'#reset').focus();await page.keyboard.press('Enter')}await save('retired');await page.mouse.up();await save('late');await drag();await save('fresh');}
 for(const kind of ['leave','reset','mode','resize','range-cancel'])await supplementary(kind,save=>cancelMouse(kind,save));
 await supplementary('wheel',async save=>{await page.evaluate(()=>scrollTo(0,0));await page.locator('#rail').hover();await page.mouse.wheel(0,120);await page.waitForTimeout(200);await save('vertical');await page.locator('#rail').hover();await page.mouse.wheel(100,0);await page.waitForTimeout(100)});
 await page.evaluate(()=>scrollTo(0,0));await settle();
 if(cdp){
 for(const kind of ['multitouch','cancel'])await supplementary(kind,async save=>{const b=await box('#GameCanvas'),points=[{id:10,x:b.x+100,y:b.y+100},...(kind==='multitouch'?[{id:11,x:b.x+180,y:b.y+100}]:[])];await touch('touchStart',points);await save('held');await touch('touchCancel',[]);await save('retired');await save('late');await drag();await save('fresh')});
 await supplementary('button-cancel',async save=>{const b=await box('#activate');await touch('touchStart',[{id:20,x:b.x+b.width/2,y:b.y+b.height/2}]);await touch('touchCancel',[]);await save('late');await page.locator('#activate').tap()});
 await supplementary('touch-scroll',async()=>{const b=await box('#rail'),x=b.x+b.width*.5,y=b.y+10;await touch('touchStart',[{id:30,x,y}]);for(let i=1;i<=5;i++){await touch('touchMove',[{id:30,x,y:y-i*18}]);await page.waitForTimeout(30)}await touch('touchEnd',[]);await page.waitForTimeout(300)});
 }else for(const caseId of ['canvas-touch-drag-20','multitouch','cancel','button-cancel','touch-scroll'])row.notRun.push({caseId,reason:'Playwright '+engine+' has touch tap; no supported multi-contact move/cancel protocol in this collector'});
 // Background/focus observation is separately collected; do not forge visibility events.
 for(const kind of ['blur','hidden']){
 await page.bringToFront();const before=await snap(),other=await context.newPage();await other.goto('about:blank');await other.bringToFront();await page.waitForTimeout(100);const retired=await snap();await other.close();await page.bringToFront();
 if(retired.events.some(e=>e.sequence>before.latest.sequence&&e.type===kind)){await drag();const fresh=await snap();row.supplementary.push({kind,stages:[{name:'before',snapshot:before},{name:'retired',snapshot:retired},{name:'late',snapshot:retired},{name:'fresh',snapshot:fresh},{name:'after',snapshot:fresh}]})}else row.notRun.push({caseId:kind,reason:'Headless foreground transition did not expose a real '+kind+' event'});
 }
 row.release=await page.evaluate(async()=>{const handle=window.__mixedInput,a=handle.release(),b=handle.release();const receipt=await a,before=handle.snapshot();await new Promise(r=>setTimeout(r,100));const after=handle.snapshot();return {samePromise:a===b,receipt,eventsBefore:before.events.length,eventsAfter:after.events.length,frameBefore:before.frame,frameAfter:after.frame,controlsDisabled:[...document.querySelectorAll('button,input')].every(x=>x.disabled)}});
 }catch(e){row.pageErrors.push(String(e.stack||e))}finally{await context.close()}
 console.log(engine,control?'html':'sdk','operations',row.operations.length,'notRun',row.notRun.length);
 }
 }finally{await browser.close()}}
 }finally{await server.close()}
 report.endedAt=new Date().toISOString();report.validation=checkReport(report);report.scopePassed=report.validation.scopePassed;report.exitCode=report.scopePassed?0:1;fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report.validation,null,2));process.exitCode=report.exitCode;
}
module.exports={expectedCenter,pixels,checkOperation,checkSupplementary,checkReport,INPUTS};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
