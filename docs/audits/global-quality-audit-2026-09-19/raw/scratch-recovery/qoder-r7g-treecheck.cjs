const crypto=require('crypto'),fs=require('fs'),path=require('path');
process.chdir('E:/AIProMax/github/cocosair.js');
const roots=fs.readdirSync('examples',{withFileTypes:true}).filter(d=>d.isDirectory())
  .map(d=>path.join('examples',d.name,'assets')).filter(p=>fs.existsSync(p));
const files=[];
for(const r of roots){(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const a=path.join(d,e.name);if(e.isDirectory())w(a);else files.push(a.split(path.sep).join('/'));}})(r);}
files.sort();
const h=crypto.createHash('sha256');let bytes=0;
for(const f of files){bytes+=fs.statSync(f).size;h.update(f);h.update(fs.readFileSync(f));}
console.log('roots='+roots.length+' files='+files.length+' bytes='+bytes+' treeDigest16='+h.digest('hex').slice(0,16));
