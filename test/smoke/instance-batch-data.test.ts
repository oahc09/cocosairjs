import { InstanceData, INSTANCE_BYTES } from '../../src/air/rendering/instance-data';
import { Mat4, Vec3, Vec4 } from '../../src/cocos/core/math';

const translated = (x: number) => Mat4.fromTranslation(new Mat4(), new Vec3(x, 0, 0));
test('partial publication keeps other staged transforms invisible until their own commit', () => {
    const d = new InstanceData(4);
    d.setMatrix(1, translated(3));
    d.setMatrix(3, translated(9));
    d.setColor(1, new Vec4(1, 0, 0, 1));
    expect(d.pendingInstances).toBe(2);
    d.publish(1, 1);
    expect(d.readMatrix(1, new Mat4()).m12).toBe(3);
    expect(d.readMatrix(3, new Mat4()).m12).toBe(0);
    expect(d.pendingInstances).toBe(1);
    expect(d.range()).toEqual({ start: 3, count: 1 });
    expect(d.committed[1 * 16 + 12]).toBe(1);
    expect(d.committed[1 * 16 + 13]).toBe(0);
});

test('growth preserves committed state and pending edits while initializing new slots', () => {
    const d = new InstanceData(2);
    d.count = 2;
    d.setMatrix(0, translated(2));
    d.publish(0, 1);
    d.setMatrix(1, translated(8));
    d.reserve(8);
    expect(d.readMatrix(0, new Mat4()).m12).toBe(2);
    expect(d.readMatrix(1, new Mat4()).m12).toBe(0);
    expect(d.readMatrix(1, new Mat4(), false).m12).toBe(8);
    expect(d.readMatrix(7, new Mat4())).toEqual(new Mat4());
    expect(d.pendingInstances).toBe(1);
    expect(d.committed.byteLength).toBe(8 * INSTANCE_BYTES);
});

test('bad transforms, colors and ranges cannot poison committed data', () => {
    const d = new InstanceData(2),
        before = d.staged.slice();
    const nan = new Mat4();
    nan.m12 = NaN;
    const projective = new Mat4();
    projective.m03 = 0.1;
    for (const m of [nan, projective]) expect(() => d.setMatrix(0, m)).toThrow('AIR_E_INSTANCE_BATCH');
    const badColor = new Vec4(1, 1, 1, 1);
    badColor.y = NaN;
    expect(() => d.setColor(0, badColor)).toThrow('AIR_E_INSTANCE_BATCH');
    expect(() => d.setMatrix(2, new Mat4())).toThrow('AIR_E_INSTANCE_BATCH');
    expect(() => d.range(1, 2)).toThrow('AIR_E_INSTANCE_BATCH');
    expect(() => d.range(undefined, 1)).toThrow('AIR_E_INSTANCE_BATCH');
    expect(d.staged).toEqual(before);
    expect(d.pendingInstances).toBe(0);
    expect(d.range()).toBeNull();
});
