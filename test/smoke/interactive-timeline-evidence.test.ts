/** Generated PNGs test validation; they are not audio/browser evidence. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{PNG}=require('pngjs');
const {expected,poseError,checkState,checkReport}=require('../../tools/verify/interactive-timeline-browser.cjs');
let dir:string;
beforeAll(()=>dir=fs.mkdtempSync(path.join(os.tmpdir(),'ier-timeline-')));
afterAll(()=>fs.rmSync(dir,{recursive:true,force:true}));
function fixture():any{const p=new PNG({width:600,height:600}),poses=expected(1);for(const v of poses){const x=300+v.position[0]*600/5.5,y=300-v.position[1]*600/5.5;for(let py=Math.floor(y-8);py<y+8;py++)for(let px=Math.floor(x-8);px<x+8;px++){const i=(py*600+px)*4;p.data[i]=240;p.data[i+1]=65;p.data[i+2]=65;p.data[i+3]=255}}const b=PNG.sync.write(p),file=path.join(dir,'view.png');fs.writeFileSync(file,b);return {kind:'assembly',expectedStage:1,expectConverged:true,snapshot:{disposed:false,submitted:3,sequence:3,submissionTimestamp:new Date().toISOString(),frames:10,clock:{method:'NATIVE_PACER'},poses,camera:{z:7,orthoHeight:2.75},layout:{rect:{left:0,top:0,width:600,height:600},dpr:1}},png:{path:file,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')}};}
const row={clock:'NATIVE_PACER',viewport:{width:600,height:600}};
describe('IER-07/08 independent evidence validation',()=>{
 test('actual 18 poses, camera and visible pixels are accepted',()=>expect(checkState(row,fixture())).toEqual({pass:true,errors:[]}));
 test.each([
 ['label without convergence',(s:any)=>{s.snapshot.poses=expected(0);s.snapshot.status='converged'}],
 ['missing part',(s:any)=>s.snapshot.poses.pop()],['nonfinite pose',(s:any)=>s.snapshot.poses[0].position[0]=NaN],
 ['camera not at target',(s:any)=>s.snapshot.camera.z=6],['no draw',(s:any)=>s.snapshot.submitted=0],
 ['no timestamp',(s:any)=>s.snapshot.submissionTimestamp=''],['NaN frame',(s:any)=>s.snapshot.frames=NaN],['future sequence',(s:any)=>s.snapshot.sequence=Infinity],['clock swap',(s:any)=>s.snapshot.clock.method='STEP_CLOCK'],
 ['PNG drift',(s:any)=>s.png.sha256='0'.repeat(64)],['wrong viewport',(_s:any,r:any)=>r.viewport.width=500],
 ])('rejects %s',(_name,change:any)=>{const s=fixture(),r=JSON.parse(JSON.stringify(row));change(s,r);expect(checkState(r,s).pass).toBe(false)});
 test('hash-correct black screenshot cannot compensate native pose',()=>{const s=fixture(),b=PNG.sync.write(new PNG({width:600,height:600}));fs.writeFileSync(s.png.path,b);s.png.bytes=b.length;s.png.sha256=crypto.createHash('sha256').update(b).digest('hex');expect(checkState(row,s).errors).toContain('native part not visible')});
 test('intermediate state must still differ from target even when label already changed',()=>{const s=fixture();s.expectConverged=false;expect(checkState(row,s).errors).toContain('native convergence');s.snapshot.poses=expected(0);expect(checkState(row,s).pass).toBe(true)});
 test('pose error includes native scale and camera',()=>{const s=fixture().snapshot;s.poses[0].scale[1]=.5;expect(poseError(s,1)).toBe(.5)});
 test('malformed report is rejected without throwing',()=>expect(checkReport(null).scopePassed).toBe(false));
});
export {};
