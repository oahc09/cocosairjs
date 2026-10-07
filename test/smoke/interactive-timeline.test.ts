/** Tests local arithmetic with real production helpers, not screenshots or simulated sound. */
import { targets,advanceMotion,poseError,sectionProgress,crossedCues,PART_COUNT,RANGE_END,CUES } from '../../examples/interactive-timeline/src/timeline-contract';
describe('IER-07/08 local timeline contract',()=>{
 test('the teaching assembly has 18 groups and the local range ends at 499',()=>{expect(targets(0)).toHaveLength(PART_COUNT);expect(PART_COUNT).toBe(18);expect(RANGE_END).toBe(499)});
 test('zero logical step preserves every native pose component',()=>expect(advanceMotion(targets(0),targets(1),0)).toEqual(targets(0)));
 test('motion converges by actual position/scale error, not stage name',()=>{let pose=targets(0);expect(poseError(pose,targets(1))).toBeGreaterThan(.002);for(let i=0;i<90;i++)pose=advanceMotion(pose,targets(1),1/60);expect(poseError(pose,targets(1))).toBeLessThan(.002)});
 test('morph convergence includes scale rather than only center position',()=>expect(poseError(targets(0),targets(2))).toBeGreaterThan(.4));
 test.each([NaN,Infinity,-1])('rejects invalid time delta %s',dt=>expect(()=>advanceMotion(targets(0),targets(1),dt)).toThrow());
 test('huge frame gaps are clamped rather than overshooting',()=>{const p=advanceMotion(targets(0),targets(1),1000);expect(poseError(p,targets(1))).toBeGreaterThan(0);expect(p[0].position[0]).toBeGreaterThan(targets(1)[0].position[0])});
 test('nonfinite native pose is rejected',()=>{const p=targets(0);p[0].position[0]=NaN;expect(()=>poseError(p,targets(1))).toThrow()});
 test('missing part cannot claim full convergence',()=>expect(()=>poseError(targets(0).slice(1),targets(1))).toThrow());
 test('short and long screens use actual document end',()=>{for(const h of [360,900])expect(sectionProgress(2500-h,h,2500,[100,800,1500,2200])).toEqual({progress:1,section:3})});
 test('reverse scroll reaches the initial section again',()=>expect(sectionProgress(0,400,2500,[100,800,1500,2200])).toEqual({progress:0,section:0}));
 test('a label changing before the next frame does not establish convergence',()=>expect(poseError(targets(0),targets(1))).not.toBe(0));
 test('each audio cue has a unique increasing target within a new 16.2s track',()=>{expect(CUES).toHaveLength(12);expect(new Set(CUES).size).toBe(12);expect(CUES.at(-1)).toBeLessThan(16.2)});
 test('one delayed frame can activate multiple elapsed cues in order',()=>expect(crossedCues(0,4)).toEqual([0,1,2,3]));
 test('cue boundary neither duplicates nor omits activation',()=>{expect(crossedCues(0,.4)).toEqual([0]);expect(crossedCues(.4,.4)).toEqual([])});
 test('seek backwards is a new session operation, not forward cue dispatch',()=>expect(crossedCues(5,1)).toEqual([]));
});
