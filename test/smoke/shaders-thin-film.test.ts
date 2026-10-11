// Synthetic contract fixtures only. Real browser claims come from the collector.
import { validate } from '../../examples/shader-thin-film/src/parameters';
const oracle = require('../../tools/verify/shaders-thin-film-oracle.cjs');
const perf = require('../../tools/verify/shaders-thin-film-performance.cjs');
const contract = require('../../tools/verify/shaders-effect-contract.cjs');
const evidence = require('../../tools/verify/shaders-thin-film-evidence.cjs');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { PNG } = require('pngjs');
describe('Thin Film independent math and evidence (synthetic fixtures)', () => {
 test('definition and defaults have a single valid source', () => {
  expect(contract.validateDefinition(oracle.definition).ok).toBe(true);
  expect(validate(oracle.definition,oracle.defaults()).ok).toBe(true);
 });
 test.each([null,{},[],{...oracle.defaults(),extra:1},{...oracle.defaults(),phase:NaN},{...oracle.defaults(),phase:Infinity},{...oracle.defaults(),phase:-.01},{...oracle.defaults(),shape:'bad'}])('reject invalid parameter input %#', value=>{
  expect(validate(oracle.definition,value).ok).toBe(false);
 });
 test('boundary plan contains unique complete descriptor cases',()=>{
  const rows=oracle.boundaryPlan();expect(rows).toHaveLength(56);expect(new Set(rows.map((r:any)=>r.caseId)).size).toBe(56);
  for(const r of rows)expect(validate(oracle.definition,{...oracle.defaults(),[r.parameter]:r.value}).ok).toBe(r.boundary!=='invalid');
 });
 test('SDF signs, outward normal and periodic phase are independent',()=>{
  expect(oracle.distance(0,0,'circle')).toBeLessThan(0);expect(oracle.distance(.4,0,'circle')).toBeGreaterThan(0);
  expect(oracle.distance(.24,.16,'rounded-box')).toBeLessThan(0);expect(oracle.normal(.3,0,'circle')[0]).toBeCloseTo(1,10);
  const p=oracle.defaults(),a=oracle.model(204,200,640,400,p,.125),b=oracle.model(204,200,640,400,{...p,phase:1},.125);
  expect(a.rgba).toEqual(b.rgba);expect(a.alpha).toBeGreaterThan(0);expect(a.linearStraight[1]).toBeLessThan(a.displayStraight[1]);
  expect(oracle.model(0,0,640,400,p,0).alpha).toBe(0);expect(oracle.model(320,200,640,400,p,0).alpha).toBe(0);
 });
 test('PNG oracle accepts its synthetic arithmetic and rejects black pixels',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'thin-film-'));try{
   const png=new PNG({width:64,height:40}),p=oracle.defaults();
   for(let y=0;y<40;y++)for(let x=0;x<64;x++){const rgba=oracle.model(x,y,64,40,p,.125).rgba;for(let c=0;c<4;c++)png.data[((39-y)*64+x)*4+c]=rgba[c];}
   const file=path.join(dir,'synthetic.png');fs.writeFileSync(file,PNG.sync.write(png));expect(oracle.pngAudit(file,p,.125).errors).toEqual([]);
   png.data.fill(0);for(let i=3;i<png.data.length;i+=4)png.data[i]=255;fs.writeFileSync(file,PNG.sync.write(png));expect(oracle.pngAudit(file,p,.125).errors.length).toBeGreaterThan(0);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
 });
 function resource(){return {rows:Array.from({length:100},(_,index)=>({index,id:index+1,before:{bufferSize:100,textureSize:50},created:{bufferSize:496,textureSize:50},after:{bufferSize:100,textureSize:50},refsBefore:[1,1,1],trace:{rendererUnbound:true,nodeRemoved:true,refs:['mesh','material','effect'].map(kind=>({kind,before:1,after:0}))},repeat:{idempotent:true},nodeValid:false,assetsValid:[false,false,false],registryPresent:false}))};}
 test('resource fixture has independent nonzero allocation and paired owner refs',()=>{expect(oracle.resourceAudit(resource()).errors).toEqual([]);});
 test.each(['allzero','refs','leak','duplicate','unbind'])('reject resource tamper %s', mutation=>{
  const r=resource();if(mutation==='allzero')r.rows.forEach(row=>row.created.bufferSize=100);if(mutation==='refs')r.rows[2].trace.refs[0].after=9;if(mutation==='leak')r.rows[3].after.bufferSize++;if(mutation==='duplicate')r.rows[1].id=1;if(mutation==='unbind')r.rows[4].trace.rendererUnbound=false;
  expect(oracle.resourceAudit(r).errors.length).toBeGreaterThan(0);
 });
 function performance(){const frames=Array.from({length:120},(_,i)=>({frame:i+1,intervalMs:16,renderEnvelopeMs:1,bufferBytes:500,textureBytes:500,drawCalls:1}));return {frames,warmupFrames:30,updateCalls:frames.map(r=>({frame:r.frame,ms:.1})),commands:frames.map(r=>({frame:r.frame,ms:.3})),draws:frames.map(r=>({frame:r.frame,ms:.2})),queueBookkeeping:frames.map(r=>({frame:r.frame,ms:.01})),gpuSamples:[],queryEvents:[],timerAvailable:false,viewport:{width:1280,height:720,dpr:1,backing:{width:1280,height:720}},device:{renderer:'SYNTHETIC'},window:{start:1,end:120,durationMs:1920},methods:{commands:'includes immediate GL',queue:'not GPU command submission',frames:'not monitor presentation'}};}
 test('performance reducer keeps distinct native/dispatch/bookkeeping samples',()=>{const result=perf.validatePerformance(performance(),perf.PROFILES[0]);expect(result.errors).toEqual([]);expect(result.measurements).toBe(90);expect(result.samples.command[0]).toBe(.3);expect(result.samples.dispatch[0]).toBe(.2);expect(result.samples.queue[0]).toBe(.01);});
 test.each(['nan','duplicate','missing-update','dpr','warmup','gpu-timeout'])('reject performance tamper %s',mutation=>{
  const r=performance();if(mutation==='nan')r.draws[80].ms=NaN;if(mutation==='duplicate')r.frames[80].frame=80;if(mutation==='missing-update')r.updateCalls.pop();if(mutation==='dpr')r.viewport.dpr=2;if(mutation==='warmup')r.warmupFrames=0;if(mutation==='gpu-timeout'){r.timerAvailable=true;r.queryEvents.push({frame:90,event:'timeout'} as never);}
  expect(perf.validatePerformance(r,perf.PROFILES[0]).errors.length).toBeGreaterThan(0);
 });
 test.each([null,{},[],{frames:[null]}])('strict evidence API is total %#',raw=>{
  expect(evidence.checkReport(raw).ok).toBe(false);expect(evidence.checkPerformance(raw,perf.PROFILES[0]).errors.length).toBeGreaterThan(0);
 });
 test('strict measured timer cannot accept one warmup sample as full GPU coverage',()=>{
  const raw:any=performance();raw.timerAvailable=true;raw.gpuSamples=[{frame:1,ms:1}];raw.queryEvents=[{frame:1,event:'begin'},{frame:1,event:'end'},{frame:1,event:'resolved',disjoint:false,nanoseconds:1000000},{frame:1,event:'deleted',nativeIsQueryAfter:false}];
  expect(evidence.checkPerformance(raw,perf.PROFILES[0]).errors).toContain('exact steady GPU frame coverage');
 });
 test('strict operation sets cannot accept arbitrary method names',()=>{
  const raw:any=performance();raw.commands[40].operation='not-a-native-operation';
  expect(evidence.checkPerformance(raw,perf.PROFILES[0]).errors).toContain('command: operation set');
 });
});
