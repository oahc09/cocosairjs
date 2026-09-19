const fs=require('fs'),c=require('crypto');
for(const f of process.argv.slice(2)){
  const b=fs.readFileSync(f);
  const w=b.readUInt32BE(16),h=b.readUInt32BE(20);
  console.log(f.split(/[\/]/).pop().padEnd(28)+b.length+'B  '+w+'x'+h+'  sha16='+c.createHash('sha256').update(b).digest('hex').slice(0,16));
}
