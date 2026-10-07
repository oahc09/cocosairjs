/** IER-06: generated PNGs validate the gate only; browser evidence is collected separately. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{PNG}=require('pngjs');
const {checkState,checkReport}=require('../../tools/verify/interactive-container-browser.cjs');
let dir:string;
beforeAll(()=>dir=fs.mkdtempSync(path.join(os.tmpdir(),'ier-container-')));
afterAll(()=>fs.rmSync(dir,{recursive:true,force:true}));
function fixture():any{const p=new PNG({width:950,height:850});for(let y=185;y<215;y++)for(let x=185;x<215;x++){const i=(y*950+x)*4;p.data[i]=240;p.data[i+1]=65;p.data[i+2]=65;p.data[i+3]=255}const b=PNG.sync.write(p),file=path.join(dir,'view.png');fs.writeFileSync(file,b);return {name:'initial-run',snapshot:{originalPuzzle50:'NOT_RUN',ready:true,selected:'Run',css:{width:200,height:200},dpr:1,buffer:{width:200,height:200},camera:{width:200,height:200},submitted:3,sequence:3,frames:10,inlineStyle:null,hits:0,canvasRect:{x:100,y:100,width:200,height:200}},png:{path:file,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')}};}
describe('IER-06 independent container readiness',()=>{
 test('accepts a complete positive-layout/submit/PNG fixture',()=>{const v=checkState({dpr:1},fixture());expect(v.ok).toBe(true);expect(v.pixels).toBe(900);expect(v.centroidError).toBe(0)});
 test.each([
 ['hidden startup',(s:any)=>s.snapshot.css.width=0],['not initialized',(s:any)=>s.snapshot.ready=false],
 ['stale framebuffer',(s:any)=>s.snapshot.buffer.width=100],['stale camera',(s:any)=>s.snapshot.camera.height=100],
 ['no submitted layout',(s:any)=>s.snapshot.submitted=0],['late draw',(s:any)=>s.snapshot.frames=0],
 ['wrong DPR',(s:any)=>s.snapshot.dpr=2],['nonfinite DPR',(s:any)=>s.snapshot.dpr=NaN],
 ['old sizing workaround',(s:any)=>s.snapshot.inlineStyle='width:200px'],['borrowed reference claim',(s:any)=>s.snapshot.originalPuzzle50='PASS'],
 ['PNG hash drift',(s:any)=>s.png.sha256='0'.repeat(64)],['missing PNG',(s:any)=>s.png.path+='missing'],
 ])('rejects %s',(_name,mutate:any)=>{const s=fixture();mutate(s);expect(checkState({dpr:1},s).ok).toBe(false)});
 test('hash-correct blank cannot prove recovered visibility',()=>{const s=fixture(),b=PNG.sync.write(new PNG({width:950,height:850}));fs.writeFileSync(s.png.path,b);s.png.bytes=b.length;s.png.sha256=crypto.createHash('sha256').update(b).digest('hex');expect(checkState({dpr:1},s).errors).toContain('compositor target missing/misplaced')});
 test('hash-correct cropped PNG cannot pass the frozen viewport',()=>{const s=fixture(),p=new PNG({width:400,height:400});for(let y=185;y<215;y++)for(let x=185;x<215;x++){const i=(y*400+x)*4;p.data[i]=240;p.data[i+1]=65;p.data[i+2]=65;p.data[i+3]=255}const b=PNG.sync.write(p);fs.writeFileSync(s.png.path,b);s.png.bytes=b.length;s.png.sha256=crypto.createHash('sha256').update(b).digest('hex');expect(checkState({dpr:1},s).errors).toContain('PNG viewport mismatch')});
 test('changing pose without moving pixels is rejected',()=>{const s=fixture();s.snapshot.hits=1;expect(checkState({dpr:1},s).ok).toBe(false)});
 test('malformed reports return rejection rather than throwing',()=>expect(checkReport(null).valid).toBe(false));
});
export {};
