import {prepareEffectForRegistration,AirEffectLayoutError} from '../../tools/debug/effect-layout';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
let source:any;
beforeAll(()=>{const dir=mkdtempSync(join(tmpdir(),'ier-diagnostic-'));try{const out=join(dir,'effect.json');execFileSync(process.execPath,['tools/build/effect-json.mjs','test/fixtures/effect-layout/spec.json',out]);source=JSON.parse(readFileSync(out,'utf8'))}finally{rmSync(dir,{recursive:true,force:true})}});
describe('IER-10 opt-in effect JSON misuse diagnosis',()=>{
 test('pure compiled JSON keeps input and source unchanged',()=>{const before=JSON.stringify(source);expect(prepareEffectForRegistration(source).bindings.filter(b=>b.set===1)).toHaveLength(3);expect(JSON.stringify(source)).toBe(before)});
 test.each(['root','nested'])('function at %s cannot silently disappear during JSON clone',level=>{const value=JSON.parse(JSON.stringify(source)),fn=()=>42;if(level==='root')value.factory=fn;else value.shaders[0].factory=fn;let actual:any;try{prepareEffectForRegistration(value)}catch(e){actual=e}expect(actual).toBeInstanceOf(AirEffectLayoutError);expect(actual.issues[0].code).toBe('NON_JSON_FUNCTION');expect(actual.issues[0].resource).toContain('factory');expect(level==='root'?value.factory:value.shaders[0].factory).toBe(fn)});
 test('cyclic compiled input gets a located preflight error rather than native stringify exception',()=>{const value=JSON.parse(JSON.stringify(source));value.self=value;let actual:any;try{prepareEffectForRegistration(value)}catch(e){actual=e}expect(actual).toBeInstanceOf(AirEffectLayoutError);expect(actual.issues[0].code).toBe('NON_JSON_CYCLE');expect(actual.issues[0].resource).toBe('$.self')});
});
