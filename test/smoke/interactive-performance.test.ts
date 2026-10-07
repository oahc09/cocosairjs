const {stats}=require('../../tools/verify/interactive-performance.cjs');
describe('local performance raw-statistics contract',()=>{
 test('percentiles use documented sorted lower-order statistic without mutating samples',()=>{const values=[8,0,3,2,1];expect(stats(values)).toEqual({count:5,p50:2,p95:3,p99:3,worst:8,mean:2.8});expect(values).toEqual([8,0,3,2,1]);});
 test('one sample has one exact value at each percentile',()=>{expect(stats([.5])).toEqual({count:1,p50:.5,p95:.5,p99:.5,worst:.5,mean:.5});});
 test.each([[[]],[[-1]],[[NaN]],[[Infinity]]])('invalid sample set is rejected: %p',values=>{expect(()=>stats(values)).toThrow('finite nonnegative');});
 test('large outlier remains in worst and mean rather than being silently removed',()=>{const samples=Array(99).fill(1).concat([101]);expect(stats(samples).worst).toBe(101);expect(stats(samples).mean).toBe(2);});
});
