// Local, offline consumer. No repository dependency installation or package mutation.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
exports.prepareInstalledAtlas=async(root)=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cocosair-atlas-consumer-'));
    const cleanup=()=>{
        const resolved=path.resolve(temp),base=path.resolve(os.tmpdir())+path.sep;
        if(!resolved.startsWith(base)||!path.basename(resolved).startsWith('cocosair-atlas-consumer-')) throw new Error('unsafe temporary cleanup target');
        fs.rmSync(resolved,{recursive:true,force:true});
    };
    try{
        const npmCli=process.env.npm_execpath||path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
        if(!fs.existsSync(npmCli)) throw new Error('npm CLI unavailable: '+npmCli);
        const run=(args,cwd)=>execFileSync(process.execPath,[npmCli,...args],{cwd,encoding:'utf8',maxBuffer:8*1024*1024});
        const packed=JSON.parse(run(['pack','--json','--pack-destination='+temp],root))[0];
        const tarball=path.join(temp,path.basename(packed.filename));
        const packageName=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).name;
        fs.writeFileSync(path.join(temp,'package.json'),JSON.stringify({private:true,type:'module',dependencies:{[packageName]:'file:'+tarball}}));
        const installOutput=run(['install','--offline','--ignore-scripts','--no-audit','--no-fund'],temp);
        const runtime=path.join(temp,'runtime.ts'),bootstrap=path.join(temp,'bootstrap.ts');
        fs.writeFileSync(runtime,`export * from '${packageName}';\n`);
        fs.writeFileSync(bootstrap,`export { createAirApp } from '${packageName}';\n`);
        const built=await require('esbuild').build({entryPoints:[bootstrap,runtime],outdir:path.join(temp,'chunks'),entryNames:'[name]',chunkNames:'chunk-[hash]',bundle:true,splitting:true,format:'esm',platform:'browser',target:'es2022',write:false});
        const contents=new Map(built.outputFiles.map((f)=>['/installed/'+path.basename(f.path),f.text]));
        const hash=(bytes)=>crypto.createHash('sha256').update(bytes).digest('hex');
        return {contents,cleanup,identity:{method:'ACTUAL_TARBALL_OFFLINE_INSTALL',packageName,tarball:{filename:packed.filename,bytes:fs.statSync(tarball).size,sha256:hash(fs.readFileSync(tarball))},
            chunks:Object.fromEntries(built.outputFiles.map((f)=>[path.basename(f.path),{bytes:f.contents.length,sha256:hash(f.contents)}])),installOutput}};
    }catch(error){cleanup();throw error;}
};
