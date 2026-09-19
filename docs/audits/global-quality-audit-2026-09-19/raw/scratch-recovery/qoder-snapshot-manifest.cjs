const fs=require('fs'),path=require('path'),c=require('crypto');
const s=process.argv[2];const out=[];
(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const a=path.join(d,e.name);if(e.isDirectory())w(a);else out.push(c.createHash('sha256').update(fs.readFileSync(a)).digest('hex').slice(0,16)+'  '+path.relative(s,a).split(path.sep).join('/'));}})(s);
out.sort();fs.writeFileSync(path.join(s,'MANIFEST.txt'),out.join('\n')+'\n');
console.log('snapshot='+s+' files='+out.length);
