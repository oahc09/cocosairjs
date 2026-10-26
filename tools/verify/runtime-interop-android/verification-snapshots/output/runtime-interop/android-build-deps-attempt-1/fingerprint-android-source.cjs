const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const source=path.resolve(__dirname,'../mystral-source');
const files=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard','--','src','include','CMakeLists.txt','cmake','android'],{cwd:source}).toString().split('\0').filter(Boolean);
const rows=Object.fromEntries([...new Set(files)].sort().map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(source,file))).digest('hex')]));
fs.writeFileSync(process.argv[2],JSON.stringify(rows,null,2)+'\n');
