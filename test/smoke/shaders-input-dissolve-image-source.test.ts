import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(__dirname, '../..');

test('production PNG decoder and upload conversion match independent bytes including alpha 1/255', () => {
    const script = `
    const fs=require('fs'), esbuild=require('esbuild'), {PNG}=require('pngjs');
    (async()=>{
        const code=esbuild.transformSync(fs.readFileSync('examples/shader-input-dissolve/src/image-source.ts','utf8'),{loader:'ts',format:'esm'}).code;
        const m=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
        const bytes=fs.readFileSync('examples/shader-input-dissolve/assets/input-pattern.png');
        const actual=await m.decodePngLocally(new Uint8Array(bytes));const expected=PNG.sync.read(bytes);
        if(actual.width!==expected.width || actual.height!==expected.height || !Buffer.from(actual.data).equals(expected.data)) throw Error('decode mismatch');
        const uploaded=m.premultipliedImage(actual.data);
        let tiny=0,hidden=0;
        for(let i=0;i<actual.data.length;i+=4){
            const a=actual.data[i+3]/255;
            if(actual.data[i+3]===1)tiny++;
            if(a===0 && actual.data.slice(i,i+3).some(v=>v>0))hidden++;
            for(let c=0;c<3;c++){
                const s=actual.data[i+c]/255;
                const linear=s<=0.04045?s/12.92:Math.pow((s+0.055)/1.055,2.4);
                if(uploaded[i+c]!==Math.round(linear*a*255))throw Error('upload mismatch');
            }
            if(uploaded[i+3]!==actual.data[i+3])throw Error('alpha changed');
        }
        if(!tiny || !hidden)throw Error('missing adversarial alpha regions');
        console.log(JSON.stringify({decoded:actual.data.length,tiny,hidden}));
    })().catch(e=>{console.error(e);process.exitCode=1});`;
    const result = JSON.parse(execFileSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8' }));
    expect(result.decoded).toBe(160 * 128 * 4);
    expect(result.tiny).toBeGreaterThan(0);
    expect(result.hidden).toBeGreaterThan(0);
});
