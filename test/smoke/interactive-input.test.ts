/** IER-05 pure collector contracts. PNGs here are generated fixtures, not browser evidence. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { PNG } = require('pngjs');
const { checkOperation, checkSupplementary, checkReport } = require('../../tools/verify/interactive-input-browser.cjs');
const clone = (v: any) => JSON.parse(JSON.stringify(v));
let directory: string;
beforeAll(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ier-input-')); });
afterAll(() => { fs.rmSync(directory, { recursive: true, force: true }); });
function fixture(control = false): any {
    const base = {control, activations:0, dragCommits:0, visibleUpdates:0, generation:2, frame:10, activePointers:[],
        latest:{sequence:0}, events:[], rangeValue:50, layout:{css:{width:200,height:200},rect:{left:0,top:0},viewport:{width:200,height:200},dpr:1},
        camera:{viewProjection:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]},
        submitted:{receivedSequence:0,submittedSequence:0,totalFrames:10,timestamp:'2026-10-08T00:00:00.000Z'}};
    const after=clone(base);after.activations=1;after.visibleUpdates=1;after.frame=11;
    after.events=[{type:'button-contact',sequence:1,generation:2,isTrusted:true,pointerType:'mouse',timestamp:'2026-10-08T00:00:00.000Z'},{type:'activate',sequence:2,isTrusted:true,pointerType:'mouse',timestamp:'2026-10-08T00:00:00.000Z'}];after.latest=after.events[1];
    after.submitted={...after.submitted,receivedSequence:2,submittedSequence:2,totalFrames:11};
    after.actor={x:-.25,y:0,z:0,meshBound:true};
    const p=new PNG({width:200,height:200});const cx=control?106.5:75,cy=control?140:100;
    for(let y=cy-12;y<cy+12;y++)for(let x=Math.floor(cx)-12;x<Math.floor(cx)+12;x++){const i=(y*200+x)*4;p.data[i]=242;p.data[i+1]=69;p.data[i+2]=69;p.data[i+3]=255;}
    const b=PNG.sync.write(p),file=path.join(directory,control?'html.png':'sdk.png');fs.writeFileSync(file,b);
    return {engine:'chromium',control,kind:'button-mouse',index:0,before:base,after,result:'PASS',png:{path:file,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')}};
}
describe('IER-05 independent model/frame/PNG contract',()=>{
    test.each([false,true])('accepts a visible legal %s control fixture',control=>{const v=checkOperation(fixture(control));expect(v.errors).toEqual([]);expect(v.visibility.count).toBe(576)});
    test.each([
        ['double activation',(r:any)=>{r.after.activations=2}],
        ['no model activation',(r:any)=>{r.after.activations=0}],
        ['no visible model update',(r:any)=>{r.after.visibleUpdates=0}],
        ['untrusted event',(r:any)=>{r.after.events[1].isTrusted=false}],
        ['mouse relabelled as touch',(r:any)=>{r.kind='button-touch'}],
        ['duplicate click',(r:any)=>{r.after.events.push({...r.after.events[1],sequence:3})}],
        ['late submission',(r:any)=>{r.after.submitted.submittedSequence=0}],
        ['future submission',(r:any)=>{r.after.submitted.submittedSequence=3}],
        ['missing draw timestamp',(r:any)=>{r.after.submitted.timestamp='UNKNOWN'}],
        ['frozen frame',(r:any)=>{r.after.submitted.totalFrames=10}],
        ['wrong native pose',(r:any)=>{r.after.actor.x=.5}],
        ['detached mesh',(r:any)=>{r.after.actor.meshBound=false}],
        ['PNG SHA drift',(r:any)=>{r.png.sha256='0'.repeat(64)}],
        ['nonfinite DPR',(r:any)=>{r.after.layout.dpr=NaN}],
        ['remaining contact',(r:any)=>{r.after.activePointers=[1]}],
        ['changed generation',(r:any)=>{r.after.generation=3}],
        ['honest NOT_RUN is not PASS',(r:any)=>{r.result='NOT_RUN'}],
    ])('rejects %s',(_name,mutate:any)=>{const r=fixture();mutate(r);expect(checkOperation(r).ok).toBe(false)});
    test('rejects a hash-correct black PNG',()=>{const r=fixture();const b=PNG.sync.write(new PNG({width:200,height:200}));fs.writeFileSync(r.png.path,b);r.png.bytes=b.length;r.png.sha256=crypto.createHash('sha256').update(b).digest('hex');expect(checkOperation(r).errors).toContain('visible marker absent/wrong position')});
    test('rejects viewport/PNG size mismatch',()=>{const r=fixture();r.after.layout.viewport.width=300;expect(checkOperation(r).ok).toBe(false)});
    test('mobile mouse cannot count as touch',()=>{const r=fixture();r.kind='canvas-touch';r.before.dragCommits=0;r.after.dragCommits=1;r.after.activations=0;r.after.events=[{type:'pointerup',sequence:1,isTrusted:true,accepted:true,owner:'canvas'},{type:'pointerdown',sequence:2,isTrusted:true,pointerType:'mouse'},{type:'pointermove',sequence:3,isTrusted:true}];expect(checkOperation(r).ok).toBe(false)});
    test('unknown supplementary cases are rejected',()=>{expect(checkSupplementary({kind:'made-up',stages:[{name:'before',snapshot:{}},{name:'after',snapshot:{events:[]}}]}).ok).toBe(false)});
    test('missing retirement/fresh stages cannot pass',()=>{expect(checkSupplementary({kind:'cancel',stages:[{name:'before',snapshot:{}},{name:'after',snapshot:{events:[]}}]}).ok).toBe(false)});
    test('self-reported completion cannot replace missing rows',()=>{expect(checkReport({schemaVersion:'ier-input/1',sourceStatus:'recreated',referenceComparison:{result:'NOT_RUN'},subset:true,completed:false,rows:[],fingerprints:[]},{verifyInputs:false}).valid).toBe(false)});
    test('bad/null reports return rejection',()=>{expect(checkReport(null,{verifyInputs:false}).valid).toBe(false)});
});
