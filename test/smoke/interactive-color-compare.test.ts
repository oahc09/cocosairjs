const {differences}=require('../../tools/verify/interactive-color-compare-browser.cjs');
describe('frozen RGBA8 color comparison (synthetic arithmetic, not browser proof)',()=>{
 test('identical capture has zero difference',()=>{const pixels=Array(256*256*4).fill(0);expect(differences(pixels,pixels)).toEqual({changed:0,max:0});});
 test('two-channel-byte tolerance does not erase larger differences',()=>{const a=Array(256*256*4).fill(0),b=[...a];b[0]=2;b[4]=3;expect(differences(a,b)).toEqual({changed:1,max:3});});
 test.each([NaN,Infinity,-1,256,1.5])('rejects invalid raw value %s',v=>{const a=Array(256*256*4).fill(0),b=[...a];b[0]=v;expect(()=>differences(a,b)).toThrow('complete RGBA8');});
 test('truncated capture cannot compare as equal',()=>expect(()=>differences([0],[0])).toThrow('complete RGBA8'));
});
