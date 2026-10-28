const fs = require('node:fs');
const { chromium } = require('playwright');
const out = '/workspace/cocosairjs/docs/physics/box3d/reports/artifacts/ex02-browser-preflight-20261028';
(async () => {
 const result = {at:new Date().toISOString(), scope:'preflight only; no qualified Box3D runtime', console:[], errors:[], http:[]};
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 page.on('console', m=>result.console.push({type:m.type(),text:m.text()}));
 page.on('pageerror', e=>result.errors.push(String(e)));
 page.on('response', r=>result.http.push({url:r.url(),status:r.status()}));
 result.browser=await browser.version();
 result.webgl=await page.evaluate(()=>{const c=document.createElement('canvas'),g=c.getContext('webgl2');if(!g)return {available:false}; const d=g.getExtension('WEBGL_debug_renderer_info');return {available:true,version:g.getParameter(g.VERSION),renderer:d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER)};});
 await page.goto('http://127.0.0.1:7472/gallery.html');
 await page.locator('#link-box3d-compound-bowling').click();
 const frame=page.frameLocator('#preview-frame');
 await frame.locator('#status').waitFor();
 await page.waitForTimeout(1000);
 result.gallery={url:page.url(),title:await page.locator('#current-title').innerText(),frame:await page.locator('#preview-frame').getAttribute('src'),status:await frame.locator('#status').innerText(),startDisabled:await frame.locator('#start').isDisabled(),closeDisabled:await frame.locator('#close').isDisabled()};
 await page.screenshot({path:out+'/gallery-missing-runtime.png',fullPage:true});
 const response=await page.request.get('http://127.0.0.1:7472/box3d-compound-bowling/identity.json');
 result.identity={status:response.status(),body:await response.text()};
 fs.writeFileSync(out+'/identity-response.txt',result.identity.body+'\n');
 await page.goto('http://127.0.0.1:7472/box3d-compound-bowling/');
 await page.locator('#status').waitFor();
 await page.screenshot({path:out+'/standalone-missing-runtime.png',fullPage:true});
 await page.goBack();
 result.back={url:page.url(),galleryVisible:await page.locator('#search').isVisible()};
 result.lifecycle='NOT_RUN';result.preCloseAcknowledged=true;
 } finally {await browser.close();result.browserCloseResolved=true;fs.writeFileSync(out+'/browser.json',JSON.stringify(result,null,2)+'\n');}
 console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1});
