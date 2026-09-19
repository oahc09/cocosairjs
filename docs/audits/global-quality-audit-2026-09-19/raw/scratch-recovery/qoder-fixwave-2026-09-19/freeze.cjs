const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.argv[2]||'E:/AIProMax/github/cocosair.js';
const EXCL=new Set(['node_modules','.git']);
function walk(dir,out){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(EXCL.has(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p,out);else out.push(p);}return out;}
const files=walk(ROOT,[]).map(p=>path.relative(ROOT,p).split(path.sep).join('/')).sort();
const lines=files.map(f=>{const h=crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,f))).digest('hex');return `${h}  ./${f}`;});
const digest=crypto.createHash('sha256').update(lines.join('\n')).digest('hex').slice(0,16);
fs.writeFileSync(process.argv[3]||'E:/qoder-fixwave-2026-09-19/SHA256MANIFEST-current.txt', lines.join('\n')+'\n');
console.log(JSON.stringify({root:ROOT,files:files.length,digest},null,1));
