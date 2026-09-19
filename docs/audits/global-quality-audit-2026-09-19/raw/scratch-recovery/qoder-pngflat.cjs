const fs=require('fs'),zlib=require('zlib');
function decode(f){
  const b=fs.readFileSync(f);let p=8,idat=[],ihdr=null;
  while(p<b.length){const len=b.readUInt32BE(p),type=b.toString('ascii',p+4,p+8),data=b.slice(p+8,p+8+len);
    if(type==='IHDR')ihdr={w:data.readUInt32BE(0),h:data.readUInt32BE(4),bd:data[8],ct:data[9]};
    if(type==='IDAT')idat.push(data);p+=12+len;}
  const raw=zlib.inflateSync(Buffer.concat(idat));
  const ch=[0,1,3,4,6][ihdr.ct]||4;const bpp=ch*(ihdr.bd/8);const stride=ihdr.w*bpp;
  const out=Buffer.alloc(ihdr.h*stride);let o=0;
  for(let y=0;y<ihdr.h;y++){const ft=raw[o++];const line=raw.slice(o,o+stride);o+=stride;
    const cur=out.slice(y*stride,(y+1)*stride),prev=y?out.slice((y-1)*stride,y*stride):Buffer.alloc(stride);
    for(let x=0;x<stride;x++){const a=x>=bpp?cur[x-bpp]:0,b2=prev[x],c=(x>=bpp&&y)?prev[x-bpp]:0;let v=line[x];
      if(ft===1)v+=a;else if(ft===2)v+=b2;else if(ft===3)v+=(a+b2>>1);else if(ft===4){const pa=Math.abs(b2-c),pb=Math.abs(a-c),pc=Math.abs(a+b2-2*c);v+=(pa<=pb&&pa<=pc)?a:(pb<=pc?b2:c);}
      cur[x]=v&255;}}
  return {ihdr,stride,bpp,out};
}
for(const f of process.argv.slice(2)){
  const d=decode(f);const u=new Set();let sample=0;
  for(let y=0;y<d.ihdr.h;y+=7)for(let x=0;x<d.stride;x+=7* d.bpp)u.add(d.out.slice(y*d.stride+x,y*d.stride+x+d.bpp).toString('hex'));
  const px=[];for(let y=0;y<Math.min(3,d.ihdr.h);y++)px.push(d.out.slice(y*d.stride,y*d.stride+d.bpp).toString('hex'));
  console.log(f.split(/[\/]/).pop().padEnd(26)+'colors='+u.size+' topLeft='+px.join('/')+' center='+d.out.slice(Math.floor(d.ihdr.h/2)*d.stride+Math.floor(d.ihdr.w/2)*d.bpp,Math.floor(d.ihdr.h/2)*d.stride+(Math.floor(d.ihdr.w/2)+1)*d.bpp).toString('hex'));
}
