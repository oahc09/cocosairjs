import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mountVisitor} from '../src/mount.mjs';
function fixture({badCCD=false,badVelocity=false,mountFails=false}={}) {
 let mounted=false,ccd=false,velocity={x:0,y:0,z:0}; const rows=[],calls=[];
 const requireMounted=()=>assert.equal(mounted,true,'pre-onLoad native access');
 return {rows,calls,args:{app:{run(){calls.push('run');if(mountFails) throw Error('mount failure');mounted=true;}},scene:{},system:{enable:false},
 body:{set useCCD(v){requireMounted();calls.push('setCCD');ccd=v;},get useCCD(){requireMounted();calls.push('getCCD');return badCCD?!ccd:ccd;},
 setLinearVelocity(v){requireMounted();calls.push('setVelocity');velocity=v;},getLinearVelocity(v){requireMounted();calls.push('getVelocity');Object.assign(v,badVelocity?{x:NaN,y:0,z:0}:velocity);}},
 ccd:true,speed:30,staticVisitor:false,vector:(x,y,z)=>({x,y,z}),record:r=>rows.push(r)}};
}
test('mount precedes uncached configuration; real readbacks recorded',()=>{
 const f=fixture(); assert.equal(mountVisitor(f.args),true);
 assert.deepEqual(f.calls,['run','setCCD','getCCD','setVelocity','getVelocity']); assert.equal(f.rows[1].actual.x,30);
});
test('bad CCD or velocity records then rejects, never silently proceeds',()=>{
 const a=fixture({badCCD:true});assert.throws(()=>mountVisitor(a.args),/CCD getter/); assert.equal(a.rows[0].actual,false);assert.ok(!a.calls.includes('setVelocity'));
 const b=fixture({badVelocity:true});assert.throws(()=>mountVisitor(b.args),/velocity getter/);assert.ok(Number.isNaN(b.rows[1].actual.x));
});
test('failed onLoad does not access body',()=>{
 const f=fixture({mountFails:true});assert.throws(()=>mountVisitor(f.args),/mount failure/);assert.deepEqual(f.calls,['run']);
});
test('static visitor stays stationary, no velocity write',()=>{
 const f=fixture();mountVisitor({...f.args,ccd:false,staticVisitor:true});assert.ok(!f.calls.includes('setVelocity'));assert.equal(f.rows[1].actual.x,0);
});
