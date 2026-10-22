/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const compile=p=>ts.transpileModule(fs.readFileSync(path.join(dir,p),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const b0=url(compile('physics-state-observer.ts'));
const api=await import(url(compile('physics-material-transaction.ts').replace(/from ['"]\.\/physics-state-observer['"]/g,`from '${b0}'`)));
const rows=[];
for(const length of [-1,NaN,0.5,'0',undefined,false]) {
 const r=new api.PhysicsMaterialTransactionRegistry(),target={};let deliveries=0,entries=0;
 const lease=r.register(target,{open(){},protectCandidate(){},preflightCopied(){},applyCopied(){},commitActual(){},fail(){},dispose(){}},{generation:1,report(){deliveries++;}});
 const reporter=r.captureCleanup(target);let threw=false,error;
 const input=new Proxy([{stage:'material-off',error:0}],{get(t,key,receiver){if(key==='length')return length;if(key==='0')entries++;return Reflect.get(t,key,receiver);}});
 try{reporter.complete(input);}catch(e){threw=true;error=String(e);}
 const d=reporter.diagnostics();const pass=threw&&entries===0&&deliveries===0;
 rows.push({length:{type:typeof length,value:String(length)},threw,error,entries,deliveries,passed:pass,reportedHasFailure:d.report?.hasFailure??null,reportLength:d.report?.errors.length??null});lease.dispose();
}
const h=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,p))).digest('hex');
const result={status:rows.every(r=>r.passed)?'PASS_LENGTH_ADMISSION':'RED_FROZEN_C_LENGTH_ADMISSION_NOT_PHYSICS',scope:'Independent frozen reporter c only. Explicit Proxy array length mutations. No product source or original c results changed.',inputs:Object.fromEntries(['physics-material-transaction.ts','physics-state-observer.ts','probe.mjs'].map(p=>[p,h(p)])),rows};
fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));process.exitCode=rows.every(r=>r.passed)?0:1;
