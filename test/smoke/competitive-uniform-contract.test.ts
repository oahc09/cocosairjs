import { Color, Mat3, Mat4, Material, Quat, Vec3, Vec4 } from '../../src';
import { Type } from '../../src/cocos/gfx';
import { Pass } from '../../src/cocos/render-scene/core/pass';
import { genHandle } from '../../src/cocos/render-scene/core/pass-utils';
import { Light as RenderLight } from '../../src/cocos/render-scene/scene/light';
import { DirectionalLight } from '../../src/cocos/3d/lights/directional-light-component';

function fixture(type = Type.FLOAT4, count = 1) {
    const pass = new Pass(null as never);
    const data = new Float32Array(64);
    const internal = pass as any;
    internal._rootBlock = data.buffer;
    internal._blocks = [data];
    internal._blocksInt = [new Int32Array(data.buffer)];
    internal._properties = {};
    internal._propertyIndex = 0;
    internal._propertyHandleMap = { u_value: genHandle(0, type, count) };
    const uploads: number[][] = [];
    internal._rootBuffer = { update: (buffer: ArrayBuffer) => uploads.push(Array.from(new Float32Array(buffer))) };
    internal._descriptorSet = { update: () => {} };
    const material = new Material();
    (material as any)._passes = [pass];
    (material as any)._props = [{}];
    return { pass, material, data, uploads, handle: pass.getHandle('u_value') };
}

describe('competitive uniform and light contracts', () => {
    test('FLOAT4 numeric array is rejected before poisoning material or GPU staging', () => {
        const { material, data } = fixture();
        const original = new Vec4(0.1, 0.2, 0.3, 0.4);
        material.setProperty('u_value', original);
        const before = Array.from(data);
        expect(() => material.setProperty('u_value', [1, 2, 3, 4])).toThrow(/AIR_E_MATERIAL_TYPE.*u_value.*FLOAT4.*Vec4/);
        expect(Array.from(data)).toEqual(before);
        expect(material.getProperty('u_value')).toBe(original);
    });

    test.each([NaN, Infinity, -Infinity, 1e100])('nonrepresentable FLOAT4 value %s is rejected atomically', (value) => {
        const { material, data } = fixture();
        material.setProperty('u_value', new Vec4(1, 2, 3, 4));
        const before = Array.from(data);
        const invalid = new Vec4(1, 2, 3, 4); invalid.z = value;
        expect(() => material.setProperty('u_value', invalid)).toThrow(/AIR_E_MATERIAL_TYPE/);
        expect(Array.from(data)).toEqual(before);
    });

    test('uniform array validates every element and declared capacity before any write', () => {
        const { material, data } = fixture(Type.FLOAT4, 2);
        material.setProperty('u_value', [new Vec4(1, 2, 3, 4), new Vec4(5, 6, 7, 8)]);
        const before = Array.from(data);
        expect(() => material.setProperty('u_value', [new Vec4(9, 10, 11, 12), new Vec3(1, 2, 3)])).toThrow(/AIR_E_MATERIAL_TYPE/);
        expect(Array.from(data)).toEqual(before);
        expect(() => material.setProperty('u_value', [new Vec4(), new Vec4(), new Vec4()])).toThrow(/AIR_E_MATERIAL_TYPE.*count/);
        expect(Array.from(data)).toEqual(before);
        material.setProperty('u_value', [null, new Vec4(9, 10, 11, 12)] as any);
        expect(Array.from(data.slice(0, 8))).toEqual([1, 2, 3, 4, 9, 10, 11, 12]);
    });

    test('Vec4 xyzw updates reach the entire uploaded block with adjacent values intact', () => {
        const { material, pass, handle, data, uploads } = fixture();
        data[4] = 91;
        material.setProperty('u_value', new Vec4(0.125, 0.25, 0.5, 0.75));
        pass.update();
        material.setProperty('u_value', new Vec4(0.75, 0.5, 0.25, 0.125));
        expect(pass.getUniform(handle, new Vec4())).toEqual(new Vec4(0.75, 0.5, 0.25, 0.125));
        pass.update();
        expect(uploads.map((values) => values.slice(0, 5))).toEqual([
            [0.125, 0.25, 0.5, 0.75, 91], [0.75, 0.5, 0.25, 0.125, 91],
        ]);
    });

    test('Color, Quat, matrices and scalar arrays preserve their existing valid representations', () => {
        const f4 = fixture();
        f4.material.setProperty('u_value', new Color(255, 128, 64, 32));
        expect(f4.data[3]).toBeCloseTo(32 / 255);
        f4.material.setProperty('u_value', new Quat(1, 2, 3, 4));
        expect(Array.from(f4.data.slice(0, 4))).toEqual([1, 2, 3, 4]);
        for (const [type, value, width] of [[Type.MAT3, new Mat3(), 9], [Type.MAT4, new Mat4(), 16]] as const) {
            const matrix = fixture(type);
            matrix.material.setProperty('u_value', value);
            const out = value instanceof Mat3 ? new Mat3() : new Mat4();
            expect(matrix.pass.getUniform(matrix.handle, out)).toEqual(value);
            expect(Array.from(matrix.data.slice(0, width)).every(Number.isFinite)).toBe(true);
        }
        const scalars = fixture(Type.FLOAT, 3);
        scalars.material.setProperty('u_value', [1, 2, 3]);
        expect(Array.from(scalars.data.slice(0, 3))).toEqual([1, 2, 3]);
    });

    test('direct Pass setter rejects invalid values with uniform identity in the diagnostic', () => {
        const { pass, handle } = fixture();
        expect(() => pass.setUniform(handle, new Vec3() as any)).toThrow(/AIR_E_MATERIAL_TYPE.*u_value/);
    });

    test('multipass preflight prevents a late incompatible pass from partially mutating earlier passes', () => {
        const first = fixture();
        const second = fixture(Type.FLOAT3);
        (first.material as any)._passes.push(second.pass);
        (first.material as any)._props.push({});
        first.data.fill(7);
        second.data.fill(8);
        expect(() => first.material.setProperty('u_value', new Vec4(1, 2, 3, 4))).toThrow(/AIR_E_MATERIAL_TYPE.*FLOAT3/);
        expect(Array.from(first.data).every((value) => value === 7)).toBe(true);
        expect(Array.from(second.data).every((value) => value === 8)).toBe(true);
    });

    test('scalar and matrix NaN are rejected before buffer mutation', () => {
        const scalar = fixture(Type.FLOAT);
        expect(() => scalar.material.setProperty('u_value', NaN)).toThrow(/AIR_E_MATERIAL_TYPE/);
        const matrix = fixture(Type.MAT4);
        const value = new Mat4(); value.m12 = NaN;
        expect(() => matrix.material.setProperty('u_value', value)).toThrow(/AIR_E_MATERIAL_TYPE/);
        expect(Array.from(matrix.data).every((component) => component === 0)).toBe(true);
    });

    test('sparse uniform arrays reject missing elements instead of writing undefined components', () => {
        const { material, data } = fixture(Type.FLOAT4, 3);
        const values = [new Vec4(1, 2, 3, 4), , new Vec4(5, 6, 7, 8)];
        expect(() => material.setProperty('u_value', values)).toThrow(/AIR_E_MATERIAL_TYPE/);
        expect(Array.from(data).every((component) => component === 0)).toBe(true);
    });

    const multipass = (linear: boolean[], count = 1) => {
        const fixtures = linear.map((flag, index) => {
            const f = fixture(Type.FLOAT4, count);
            (f.pass as any)._propertyIndex = index;
            (f.pass as any)._properties = { u_value: { linear: flag } };
            return f;
        });
        const material = fixtures[0].material;
        (material as any)._passes = fixtures.map(f => f.pass);
        (material as any)._props = fixtures.map(() => ({ untouched: 17 }));
        return { material, fixtures };
    };

    test('linear conversion overflow cannot partially mutate another pass or retained properties', () => {
        const {material,fixtures} = multipass([false,true]);
        const original = new Vec4(.2,.3,.4,1);
        material.setProperty('u_value', original);
        const before = fixtures.map(f => Array.from(f.data));
        expect(() => material.setProperty('u_value',new Vec4(1e30,0,0,1))).toThrow(/AIR_E_MATERIAL_TYPE/);
        expect(fixtures.map(f => Array.from(f.data))).toEqual(before);
        expect(material.getProperty('u_value',0)).toBe(original);
        expect(material.getProperty('u_value',1)).toBe(original);
        expect((material as any)._props.map(props => props.untouched)).toEqual([17,17]);
    });

    test.each([[true,false],[false,true]])('different linear metadata prepares independent snapshots %s', (a,b) => {
        const {material,fixtures} = multipass([a,b]);
        for (const value of [new Vec4(.5,.25,.75,.4),new Vec4(.25,.5,.75,.8)]) {
            material.setProperty('u_value',value);
            fixtures.forEach((f,index) => {
                const linear = [a,b][index];
                expect(f.data[0]).toBeCloseTo(linear ? value.x*value.x : value.x);
                expect(f.data[1]).toBeCloseTo(linear ? value.y*value.y : value.y);
                expect(f.data[2]).toBeCloseTo(linear ? value.z*value.z : value.z);
                expect(f.data[3]).toBeCloseTo(value.w);
                expect(material.getProperty('u_value',index)).toBe(value);
            });
        }
    });

    test('Color retains native scalar conversion and original reference without changing alpha', () => {
        const {material,fixtures} = multipass([true,false]);
        const color = new Color(128,96,64,32);
        material.setProperty('u_value',color);
        expect(fixtures[0].data[0]).toBeCloseTo((128/255)**2);
        expect(fixtures[1].data[0]).toBeCloseTo(128/255);
        expect(fixtures[0].data[3]).toBeCloseTo(32/255);
        expect(fixtures[1].data[3]).toBeCloseTo(32/255);
        expect(material.getProperty('u_value')).toBe(color);
    });

    test('linear arrays preserve native raw values, null skips and partial updates', () => {
        const {material,fixtures} = multipass([true,false],2);
        const values = [new Color(128,96,64,32),new Vec4(.5,.25,.75,.4)];
        material.setProperty('u_value',values);
        fixtures.forEach(f => { expect(f.data[0]).toBeCloseTo(128/255);expect(f.data[4]).toBeCloseTo(.5); });
        const partial = [null,new Vec4(.3,.4,.5,.6)] as any;
        material.setProperty('u_value',partial);
        fixtures.forEach(f => { expect(f.data[0]).toBeCloseTo(128/255);expect(f.data[4]).toBeCloseTo(.3); });
        const before = fixtures.map(f=>Array.from(f.data));
        expect(()=>material.setProperty('u_value',[new Vec4(),new Vec3()] as any)).toThrow(/AIR_E_MATERIAL_TYPE/);
        expect(fixtures.map(f=>Array.from(f.data))).toEqual(before);
        expect(material.getProperty('u_value',0)).toBe(partial);
        expect(material.getProperty('u_value',1)).toBe(partial);
    });

    test('conversion metadata exceptions leave every pass and property untouched', () => {
        const {material,fixtures} = multipass([false,true]);
        const original = new Vec4(.2,.3,.4,1);material.setProperty('u_value',original);
        const before = fixtures.map(f=>Array.from(f.data));
        Object.defineProperty((fixtures[1].pass as any)._properties.u_value,'linear',{get:()=>{throw new Error('invalid conversion metadata');}});
        expect(()=>material.setProperty('u_value',new Vec4(.5,.5,.5,1))).toThrow('invalid conversion metadata');
        expect(fixtures.map(f=>Array.from(f.data))).toEqual(before);
        expect(material.getProperty('u_value',0)).toBe(original);
        expect(material.getProperty('u_value',1)).toBe(original);
    });

    test('snapshot exceptions happen before any pass writes', () => {
        const {material,fixtures} = multipass([false,true]);
        const original = new Vec4(.2,.3,.4,1);material.setProperty('u_value',original);
        const before = fixtures.map(f=>Array.from(f.data));
        const invalid = new Vec4(.5,.5,.5,1);
        invalid.clone = () => {throw new Error('snapshot failure');};
        expect(()=>material.setProperty('u_value',invalid)).toThrow('snapshot failure');
        expect(fixtures.map(f=>Array.from(f.data))).toEqual(before);
        expect(material.getProperty('u_value')).toBe(original);
    });

    test('component Light accepts Color, rejects Vec3 and retains its previous color', () => {
        const light = new DirectionalLight();
        light.color = new Color(120, 140, 160);
        const before = light.color.clone();
        expect(() => { light.color = new Vec3(1, 1, 1) as any; }).toThrow(/AIR_E_LIGHT_TYPE.*color.*Color/);
        expect(light.color).toEqual(before);
    });

    test('render Light continues accepting Vec3 while rejecting nonfinite components and temperature', () => {
        const light = new RenderLight();
        light.color = new Vec3(0.2, 0.4, 0.8);
        const before = light.color.clone();
        const invalid = new Vec3(); invalid.y = NaN;
        expect(() => { light.color = invalid; }).toThrow(/AIR_E_LIGHT_TYPE/);
        expect(light.color).toEqual(before);
        const temperature = light.colorTemperature;
        expect(() => { light.colorTemperature = Infinity; }).toThrow(/AIR_E_LIGHT_TYPE/);
        expect(light.colorTemperature).toBe(temperature);
    });
});
