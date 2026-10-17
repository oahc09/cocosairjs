const fs=require('fs'),path=require('path'),http=require('http');
const root=process.cwd();
const {serveStaticFile}=require(path.join(root,'tools/verify/static-file-response.cjs'));
const {launchOptions}=require(path.join(root,'tools/verify/browser-engines.cjs'));
(async()=>{
 const server=http.createServer((req,res)=>{
  if(req.url==='/clip.mp4')return serveStaticFile(req,res,path.join(root,'examples/video-basic/assets/clip.mp4'),'video/mp4');
  res.writeHead(200,{'Content-Type':'text/html'});res.end('<video preload="auto" playsinline width="320" height="240"></video><button>Play video</button>');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await require('playwright').webkit.launch(launchOptions('webkit'));
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(()=>{
   const v=document.querySelector('video');v.muted=true;const source=document.createElement('source');v.appendChild(source);source.src='/clip.mp4';
   window.__events=[];for(const n of ['playing','pause','seeking','seeked','ended'])v.addEventListener(n,()=>window.__events.push({name:n,time:v.currentTime,paused:v.paused}));
   document.querySelector('button').onclick=()=>{v.play().then(()=>window.__started=true).catch(e=>window.__error=String(e));};
  });
  await page.waitForFunction(()=>document.querySelector('video').readyState>=2,null,{timeout:10000});
  await page.getByRole('button',{name:'Play video'}).click();
  const result=await page.evaluate(async()=>{
   const v=document.querySelector('video');const wait=async(f,ms)=>{const end=performance.now()+ms;while(performance.now()<end){if(f())return true;await new Promise(r=>setTimeout(r,25));}return false;};
   const warmed=await wait(()=>window.__started&&!v.paused&&v.currentTime>.1,4000);
   v.pause();v.loop=true;v.currentTime=2;
   const settled=await wait(()=>!v.seeking&&v.currentTime>1.9&&v.currentTime<2.3,3000);
   let playError=null;try{await Promise.race([v.play(),new Promise((_,reject)=>setTimeout(()=>reject(Error('play timeout')),4000))]);}catch(e){playError=String(e);}
   const nearEnd=settled&&!playError&&await wait(()=>!v.paused&&!v.seeking&&v.currentTime>2.2,2500);
   const wrapped=nearEnd&&await wait(()=>!v.paused&&!v.seeking&&v.currentTime<1,4000);
   const continued=wrapped&&await wait(()=>!v.paused&&!v.seeking&&v.currentTime>0.15,2000);
   return {warmed,settled,nearEnd,wrapped,continued,playError,error:window.__error,paused:v.paused,currentTime:v.currentTime,loop:v.loop,muted:v.muted,defaultMuted:v.defaultMuted,events:window.__events};
  });
  fs.writeFileSync(path.join(__dirname,'native-video-gesture.json'),JSON.stringify({method:'NATIVE_HTML_VIDEO_TRUSTED_CLICK_NO_AIR',browserVersion:browser.version(),...result},null,2)+'\n');console.log(result);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
