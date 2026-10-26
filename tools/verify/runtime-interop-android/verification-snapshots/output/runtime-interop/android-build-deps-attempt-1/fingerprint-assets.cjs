const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(process.argv[2]);
const files=[];
function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())visit(file);else if(entry.isFile())files.push(file);else throw Error('Asset input must be a regular file or directory');}}
visit(root);
const rows=Object.fromEntries(files.sort().map(file=>[path.relative(root,file).replace(/\\/g,'/'),crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
fs.writeFileSync(process.argv[3],JSON.stringify(rows,null,2)+'\n');
