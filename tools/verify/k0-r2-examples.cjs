'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { launchOptions } = require('./browser-engines.cjs');
const root = path.resolve(__dirname, '../..');
const INPUTS = ['build/cocosair.module.js', 'build/cocosair.module.d.ts',
    'examples/k0-r2-porting-contracts/src/main.ts', 'examples/k0-r2-porting-contracts/index.html',
    'examples/shared/batching-routes.ts', 'examples/shared/asset-lifecycle.js',
    'examples/gltf-skin/src/main.ts', 'docs/manual/examples/manual-drawing-lines/main.ts',
    'examples/gltf-skin/assets/SimpleSkin.gltf', 'examples/gltf-skin/assets/SimpleSkin_animation.bin',
    'examples/gltf-skin/assets/SimpleSkin_geometry.bin', 'examples/gltf-skin/assets/SimpleSkin_inverseBindMatrices.bin',
    'examples/gltf-skin/assets/SimpleSkin_skinningData.bin', 'tools/verify/browser-engines.cjs',
    'tools/verify/competitive-example-server.cjs', 'tools/verify/k0-r2-examples.cjs', 'tools/verify/k0-r2-examples.tsconfig.json'];
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function pixels(bytes) {
    const { PNG } = require('pngjs');
    const p = PNG.sync.read(bytes);
    const counts = { red: 0, green: 0, blue: 0, yellow: 0, cyan: 0, foreground: 0, litForeground: 0 };
    const background = Array.from(p.data.slice(0, 3));
    for (let i = 0; i < p.data.length; i += 4) {
        const [r, g, b] = p.data.subarray(i, i + 3);
        if (Math.max(Math.abs(r-background[0]), Math.abs(g-background[1]), Math.abs(b-background[2])) > 25) { counts.foreground++; if(r+g+b>180) counts.litForeground++; }
        if (r > 90 && r > g*1.3 && r > b*1.3) counts.red++;
        if (g > 90 && g > r*1.3 && g > b*1.3) counts.green++;
        if (b > 90 && b > r*1.3 && b > g*1.3) counts.blue++;
        if (r > 100 && g > 100 && b < Math.min(r,g)*0.6) counts.yellow++;
        if (g > 100 && b > 100 && r < Math.min(g,b)*0.6) counts.cyan++;
    }
    return { width: p.width, height: p.height, counts };
}
function checkRow(r) {
    const errors = [];
    const required=['pageErrors','consoleErrors','vertex','blend','billboard','dynamic','pause','resume','reset','release','skin','skinPixels','skinLifecycle','batch','batchLifecycle','lines','mobile','exampleLifecycle'];
    if(required.some(k=>r[k]===undefined)) return {pass:false,errors:['incomplete observation']};
    const check = (v, message) => { if (!v) errors.push(message); };
    check(r.pageErrors.length === 0 && r.consoleErrors.length === 0, 'browser errors');
    check(r.vertex.counts.red > 100 && r.vertex.counts.blue > 100 && r.vertex.counts.green > 100, 'vertex colors');
    check(r.blend.counts.yellow > 100 && r.blend.counts.cyan > 100, 'alpha/add colors');
    check(r.billboard.counts.foreground > 1000, 'billboard visible');
    check(r.dynamic.after > r.dynamic.before && r.dynamic.changedPixels > 100, 'dynamic movement');
    check(r.pause.before === r.pause.after && r.pause.pngSame, 'pause stability');
    check(r.resume.after > r.resume.before, 'resume');
    check(r.reset.after < r.reset.before && r.reset.after <= 2, 'reset');
    check(r.release.released && !r.release.subscribed && r.release.ownedAssetCount === 0 && r.release.ownedNodeCount === 0, 'release structure');
    check(r.release.releasedAssets.length >= 11 && r.release.releasedAssets.every(a => a.beforeRefCount === 1 && a.afterRefCount === 0), 'release references');
    check(r.releaseAgain === r.release.releasedAssets.length, 'release idempotence');
    check(r.skin.controllers === 1 && r.skin.playing && r.skin.loop && r.skin.clipUnchanged && r.skin.time > r.skin.duration, 'native skin loop');
    check(r.skin.materials.length > 0 && r.skin.materials.every(n => n === 'air-gltf-standard'), 'default gltf material');
    check(r.skinPixels.counts.litForeground > 1000, 'skin visible');
    for (const key of ['exampleLifecycle', 'skinLifecycle', 'batchLifecycle']) check(r[key].released && r[key].reloaded && r[key].leaked.length === 0 && r[key].errors.length === 0, key);
    check(r.batch.ready && r.batch.checks.length >= 3 && r.batch.checks.every(c=>c.ok), 'existing dynamic route');
    check(r.lines.counts.red > 10 && r.lines.counts.green > 10 && r.lines.counts.blue > 10, 'drawing lines');
    check(r.mobile.fits && r.mobile.controlsVisible && r.mobile.capture.counts.foreground > 1000, 'mobile viewport');
    return { pass: errors.length === 0, errors };
}
async function main() {
    const outArg = process.argv.find(a=>a.startsWith('--out='));
    assert(outArg, 'explicit --out=<new.json> required');
    const out = path.resolve(root, outArg.slice(6));
    assert(!fs.existsSync(out), 'output already exists');
    const artifactDir = out.replace(/\.json$/, '') + '-artifacts';
    fs.mkdirSync(artifactDir, { recursive: true });
    const report = { schemaVersion: 'k0-r2-examples/1', startedAt: new Date().toISOString(),
        command: [process.execPath, ...process.argv.slice(1)], cwd: root,
        subset: true, completed: false, method: 'REAL_BROWSER', fingerprints: {}, rows: [] };
    for (const f of INPUTS) { const b = fs.readFileSync(path.join(root,f)); report.fingerprints[f] = { bytes: b.length, sha256: sha(b) }; }
    const pw = require('playwright');
    const { startExampleServer } = require('./competitive-example-server.cjs');
    const server = await startExampleServer(root);
    const engines = (process.argv.find(a=>a.startsWith('--browser=')) || '--browser=all').slice(10);
    try {
        for (const engine of engines === 'all' ? ['chromium','firefox','webkit'] : [engines]) {
            const browser = await pw[engine].launch({ ...launchOptions(engine), headless: true });
            const r = { engine, browserVersion: browser.version(), pageErrors: [], consoleErrors: [], captures: [] };
            let page;
            async function open(url, ready) {
                if (page) await page.close();
                page = await browser.newPage({ viewport: { width: 800, height: 600 } });
                await page.route('**/favicon.ico', route=>route.fulfill({status:204}));
                page.on('pageerror', e=>r.pageErrors.push(String(e)));
                page.on('console', m=>{ if (m.type()==='error' && !m.text().includes('[Physics] PhysicsSystem initDefaultMaterial()')) r.consoleErrors.push(m.text()); });
                await page.goto(server.origin+url);
                await page.waitForFunction(ready, null, { timeout: 45000, polling: 100 });
            }
            async function tick(n=1, dt=0) {
                await page.evaluate(async ({n,dt})=>{
                    const cc=await import('/build/cocosair.module.js'); cc.game.pause();
                    for(let i=0;i<n;i++) cc.director.tick(dt);
                }, {n,dt});
            }
            async function capture(name) {
                const data=await page.evaluate(async()=>{
                    const cc=await import('/build/cocosair.module.js'); cc.game.pause(); cc.director.tick(0);
                    return document.querySelector('#GameCanvas').toDataURL('image/png').split(',')[1];
                });
                const b=Buffer.from(data,'base64');
                const file=path.join(artifactDir, `${engine}-${name}.png`); fs.writeFileSync(file,b,{flag:'wx'});
                const metric=pixels(b); r.captures.push({ name, path:path.relative(root,file).replace(/\\/g,'/'), sha256:sha(b), bytes:b.length, ...metric });
                return { bytes:b, metric };
            }
            const snapshot=()=>page.evaluate(()=>{ const x=window.__k0Example; return { mode:x.mode, paused:x.paused, released:x.released, subscribed:x.subscribed, ownedNodeCount:x.ownedNodeCount, ownedAssetCount:x.ownedAssetCount, releasedAssets:x.releasedAssets, dynamicUpdateCount:x.dynamicUpdateCount, errors:x.errors }; });
            try {
                await open('/examples/k0-r2-porting-contracts/', ()=>!!window.__k0Example);
                r.vertex=(await capture('vertex')).metric;
                await page.click('[data-mode="blend"]'); r.blend=(await capture('blend')).metric;
                await page.click('[data-mode="billboard"]'); r.billboard=(await capture('billboard')).metric;
                await page.click('[data-mode="dynamic-mesh"]');
                const start=await capture('dynamic-before'); const before=(await snapshot()).dynamicUpdateCount;
                await tick(20,1/60); const end=await capture('dynamic-after');
                const {PNG}=require('pngjs'); const a=PNG.sync.read(start.bytes).data,b=PNG.sync.read(end.bytes).data;
                let changedPixels=0; for(let i=0;i<a.length;i+=4) if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2]) changedPixels++;
                r.dynamic={before,after:(await snapshot()).dynamicUpdateCount,changedPixels};
                await page.click('#btn-pause'); const paused=await capture('paused'); const p0=(await snapshot()).dynamicUpdateCount;
                await tick(20,1/60); const pausedAfter=await capture('paused-after');
                r.pause={before:p0,after:(await snapshot()).dynamicUpdateCount,pngSame:paused.bytes.equals(pausedAfter.bytes)};
                await page.click('#btn-pause'); const resumeBefore=(await snapshot()).dynamicUpdateCount; await tick(5,1/60);
                r.resume={before:resumeBefore,after:(await snapshot()).dynamicUpdateCount};
                const resetBefore=(await snapshot()).dynamicUpdateCount; await page.click('#btn-reset');
                r.reset={before:resetBefore,after:(await snapshot()).dynamicUpdateCount};
                await page.click('#btn-release'); r.release=await snapshot(); await tick(2);
                await page.click('#btn-release'); r.releaseAgain=(await snapshot()).releasedAssets.length;
                await page.click('[data-mode="vertex-color"]'); await page.setViewportSize({width:390,height:720});
                r.mobile={ controlsVisible:await page.evaluate(()=>{const b=document.querySelector('#controls').getBoundingClientRect(); return b.left>=0 && b.top>=0 && b.right<=innerWidth && b.bottom<=innerHeight;}), fits:await page.evaluate(()=>document.querySelector('#GameCanvas').getBoundingClientRect().right<=innerWidth), capture:(await capture('mobile')).metric };
                await page.screenshot({path:path.join(artifactDir,`${engine}-page.png`)});
                await page.evaluate(async()=>{const cc=await import('/build/cocosair.module.js');cc.game.resume();});
                r.exampleLifecycle=await page.evaluate(()=>window.__lifecycle());
                await open('/examples/gltf-skin/', ()=>!!window.__skinState?.playing);
                await tick();
                const duration=await page.evaluate(async()=>{const cc=await import('/build/cocosair.module.js'); const anim=cc.director.getScene().getComponentsInChildren(cc.Animation)[0]; return anim.clips[0].duration;});
                await tick(Math.ceil((duration+.5)*60),1/60);
                r.skin=await page.evaluate(async()=>{
                    const cc=await import('/build/cocosair.module.js'), s=cc.director.getScene(), aa=s.getComponentsInChildren(cc.Animation), anim=aa[0], clip=anim.clips[0], state=anim.getState(clip.name);
                    return {controllers:aa.length, playing:state.isPlaying, time:state.time, duration:clip.duration,
                        loop:state.wrapMode===cc.AnimationClip.WrapMode.Loop, clipUnchanged:clip.wrapMode===cc.AnimationClip.WrapMode.Normal,
                        materials:s.getComponentsInChildren(cc.SkinnedMeshRenderer).map(m=>m.getSharedMaterial(0)?.effectAsset?.name)};
                });
                r.skinPixels=(await capture('skin')).metric;
                await page.evaluate(async()=>{const cc=await import('/build/cocosair.module.js');cc.game.resume();});
                r.skinLifecycle=await page.evaluate(()=>window.__lifecycle());
                await open('/examples/batching-dynamic/', ()=>!!window.__trialProbe?.ready);
                r.batch=await page.evaluate(()=>window.__trialProbe);
                r.batchLifecycle=await page.evaluate(()=>window.__lifecycle());
                await open('/docs/manual/examples/manual-drawing-lines/', ()=>!!window.__airApp && document.querySelector('#info').textContent.includes('nodes:'));
                r.lines=(await capture('lines')).metric;
            } catch(e) { r.pageErrors.push(String(e.stack || e)); }
            finally { if(page) await page.close(); await browser.close(); }
            r.validation=checkRow(r); report.rows.push(r);
            console.log(JSON.stringify({engine,...r.validation}));
        }
    } finally { await server.close(); }
    report.endedAt=new Date().toISOString(); report.scopePassed=report.rows.length>0&&report.rows.every(r=>r.validation.pass);
    report.exitCode=report.scopePassed?0:1;
    fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    process.exitCode=report.exitCode;
}
module.exports={checkRow,pixels};
if(require.main===module) main().catch(e=>{console.error(e.stack);process.exitCode=1;});
