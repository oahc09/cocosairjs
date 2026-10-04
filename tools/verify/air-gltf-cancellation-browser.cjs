const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {startExampleServer}=require('./competitive-example-server.cjs'),{launchOptions}=require('./browser-engines.cjs');
const root=path.resolve(__dirname,'../..'),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
async function main(){
    const out=process.argv.find(v=>v.startsWith('--out='))?.slice(6);assert(out,'--out required');const output=path.resolve(root,out);assert(!fs.existsSync(output),'new report required');
    const bundle=process.argv.find(v=>v.startsWith('--bundle='))?.slice(9)??'build/cocosair.module.js';assert(path.resolve(root,bundle).startsWith(root+path.sep));
    const files=[bundle,'src/air/assets/gltf/loader.ts','src/air/assets/gltf/parser-context.ts','test/fixtures/gltf-cancellation/main.ts','test/fixtures/gltf-cancellation/index.html','tools/verify/air-gltf-cancellation-browser.cjs'];
    const startedAt=new Date().toISOString(),fingerprints=Object.fromEntries(files.map(f=>[f,hash(f)]));
    const built=await require('esbuild').build({entryPoints:[path.join(root,'test/fixtures/gltf-cancellation/main.ts')],bundle:true,write:false,format:'esm',target:'es2022',alias:{cocosair:'/'+bundle},external:['/'+bundle]});
    // Actual local HTTP transport. This wrapper adds delayed endpoints without modifying the repository server.
    const http=require('node:http'), base=await startExampleServer(root), transfers=[];
    const server=http.createServer((req,res)=>{
        const url=new URL(req.url,'http://local').pathname;
        if(/^\/(slow.*|must-not-request)\.(bin|gltf)$/.test(url)){
            const record={url,at:Date.now(),finished:false,closedBeforeFinish:false};transfers.push(record);
            res.on('finish',()=>{record.finished=true;record.endedAt=Date.now();});res.on('close',()=>{record.closedBeforeFinish=!record.finished;record.closedAt=Date.now();});
            setTimeout(()=>{if(res.destroyed)return;res.writeHead(200,{'Content-Type':'application/octet-stream'});res.end(url.endsWith('.gltf')?JSON.stringify({asset:{version:'2.0'}}):Buffer.alloc(4));},700);return;
        }
        const upstream=http.request(new URL(req.url,base.origin),{method:req.method,headers:req.headers},u=>{res.writeHead(u.statusCode,u.headers);u.pipe(res);});upstream.on('error',e=>{res.writeHead(500);res.end(String(e));});upstream.end();
    });await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,pw=require('playwright'),results=[];
    const wait=async(url,start)=>{const deadline=Date.now()+10000;while(!transfers.slice(start).some(r=>r.url===url)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));assert(transfers.slice(start).some(r=>r.url===url),'request did not start');};
    try{for(const engine of ['chromium','firefox','webkit']){let browser,observation;const start=transfers.length;
        try{browser=await pw[engine].launch({...launchOptions(engine),headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
            await page.route('**/main.ts',r=>r.fulfill({contentType:'text/javascript',body:built.outputFiles[0].text}));await page.goto(origin+'/test/fixtures/gltf-cancellation/');await page.waitForFunction(()=>window.__gltfCancel?.ready,null,{timeout:60000});
            const pre=await page.evaluate(()=>window.__gltfCancel.preaborted());assert.equal(pre.name,'AbortError');assert(!transfers.slice(start).some(r=>r.url==='/must-not-request.bin'));
            await page.evaluate(()=>window.__gltfCancel.begin('subresource'));await wait('/slow-abort.bin',start);
            const peerPromise=page.evaluate(()=>window.__gltfCancel.peer());const aborted=await page.evaluate(()=>window.__gltfCancel.abort());assert.equal(aborted.name,'AbortError');
            const peer=await peerPromise;assert(peer.valid&&peer.destroyed);
            await page.evaluate(()=>window.__gltfCancel.begin('container'));await wait('/slow.gltf',start);const container=await page.evaluate(()=>window.__gltfCancel.abort());assert.equal(container.status,'rejected');assert(/abort/i.test(container.message));
            await new Promise(r=>setTimeout(r,50));const transport=transfers.slice(start);const abortTransfer=transport.find(r=>r.url==='/slow-abort.bin'),peerTransfer=transport.find(r=>r.url==='/slow-peer.bin'),containerTransfer=transport.find(r=>r.url==='/slow.gltf');
            assert(abortTransfer.closedBeforeFinish&&!abortTransfer.finished,'subresource fetch is truly aborted');assert(peerTransfer.finished&&!peerTransfer.closedBeforeFinish,'independent peer preserved');assert(containerTransfer.finished&&!containerTransfer.closedBeforeFinish,'native top-level transfer is not advertised as canceled');
            const close=await page.evaluate(()=>window.__gltfCancel.close());assert.equal(close.status,'released');assert.deepEqual(errors,[]);observation={pre,aborted,peer,container,transport,close,errors};results.push({engine,status:'PASS',version:browser.version(),observation});
        }catch(e){results.push({engine,status:'FAIL',observation,transport:transfers.slice(start),error:String(e.stack||e)});}finally{await browser?.close();}console.error(JSON.stringify({engine,status:results.at(-1).status,error:results.at(-1).error}));
    }for(const f of files)assert.equal(hash(f),fingerprints[f],'candidate drift: '+f);const passed=results.every(r=>r.status==='PASS');fs.writeFileSync(output,JSON.stringify({startedAt,endedAt:new Date().toISOString(),command:process.argv,cwd:root,method:'REAL_BROWSER',subset:true,completed:false,scopePassed:passed,fingerprints,results,
        limitations:['Public GLTFParserContext child buffer/image fetch carries signal; native loadAsync container downloader does not','Independent parse requests tested, not a transport subscription pool','No compressed decoder cancellation or GPU memory claim']},null,2)+'\n',{flag:'wx'});process.exitCode=passed?0:1;
    }finally{await new Promise(r=>server.close(r));await base.close();}
}main().catch(e=>{console.error(e);process.exitCode=1;});
