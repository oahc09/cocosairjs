/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Actual Collider.onLoad/onDestroy and PhysicsMaterial EventTarget, explicit fake shape delegate only.
 * Source/control test, not native physics evidence.
 */
import { BoxCollider } from '../../../src/cocos/physics/framework/components/colliders/box-collider';
import { PhysicsMaterial } from '../../../src/cocos/physics/framework/assets/physics-material';
import * as selection from '../../../src/cocos/physics/framework/physics-selector';
const originalId = selection.selector.id;
const materials: PhysicsMaterial[] = [];
const select = (id: string) => {
    (selection.selector as unknown as { id: string }).id = id;
};
function material() {
    const value = new PhysicsMaterial();
    materials.push(value);
    return value;
}
afterEach(() => {
    jest.restoreAllMocks();
    select(originalId);
    for (const value of materials) {
        const i = PhysicsMaterial.allMaterials.indexOf(value);
        if (i >= 0) PhysicsMaterial.allMaterials.splice(i, 1);
    }
    materials.length = 0;
});
function shape() {
    return {
        initialize: jest.fn(),
        onLoad: jest.fn(),
        setMaterial: jest.fn(),
        updateEventListener: jest.fn(),
        onDestroy: jest.fn(),
    };
}
test('Box3D initial listener attaches after successful actual onLoad and detaches onDestroy', () => {
    select('box3d');
    const asset = material(),
        collider = new BoxCollider() as any,
        delegate = shape();
    collider.sharedMaterial = asset;
    const on = jest.spyOn(asset, 'on'),
        off = jest.spyOn(asset, 'off');
    jest.spyOn(selection, 'createShape').mockReturnValue(delegate as any);
    collider.onLoad();
    expect(on).toHaveBeenCalledTimes(1);
    expect(on.mock.invocationCallOrder[0]).toBeGreaterThan(delegate.onLoad.mock.invocationCallOrder[0]);
    asset.friction = 0.25;
    expect(delegate.setMaterial).toHaveBeenCalledWith(asset);
    collider.onDestroy();
    expect(off).toHaveBeenCalledTimes(1);
    const count = delegate.setMaterial.mock.calls.length;
    asset.friction = 0.5;
    expect(delegate.setMaterial).toHaveBeenCalledTimes(count);
});
test('Box3D initial listener is not attached if shape initialization rejects', () => {
    select('box3d');
    const asset = material(),
        collider = new BoxCollider() as any,
        delegate = shape();
    collider.sharedMaterial = asset;
    const on = jest.spyOn(asset, 'on');
    delegate.initialize.mockImplementation(() => {
        throw new Error('explicit shape initialization rejection');
    });
    jest.spyOn(selection, 'createShape').mockReturnValue(delegate as any);
    expect(() => collider.onLoad()).toThrow('explicit shape initialization rejection');
    expect(on).not.toHaveBeenCalled();
    expect(collider.sharedMaterial).toBe(asset);
});
test.each(['builtin', 'cannon.js'])('%s preserves original sharedMaterial setter before shape creation', (backend) => {
    select(backend);
    const collider = new BoxCollider() as any,
        delegate = shape(),
        asset = material();
    collider.sharedMaterial = asset;
    const set = jest.spyOn(collider, 'sharedMaterial', 'set');
    const create = jest.spyOn(selection, 'createShape').mockReturnValue(delegate as any);
    const on = jest.spyOn(asset, 'on');
    collider.onLoad();
    expect(set).toHaveBeenCalledWith(asset);
    expect(set.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0]);
    expect(on).not.toHaveBeenCalled(); // Preserve, do not silently repair another backend in this narrow patch.
});
test('Box3D shared asset has one listener per collider and destroyed owner does not receive updates', () => {
    select('box3d');
    const asset = material(),
        a = new BoxCollider() as any,
        b = new BoxCollider() as any;
    a.sharedMaterial = asset;
    b.sharedMaterial = asset;
    const sa = shape(),
        sb = shape();
    jest.spyOn(selection, 'createShape')
        .mockReturnValueOnce(sa as any)
        .mockReturnValueOnce(sb as any);
    a.onLoad();
    b.onLoad();
    asset.friction = 0.25;
    expect(sa.setMaterial).toHaveBeenCalledTimes(1);
    expect(sb.setMaterial).toHaveBeenCalledTimes(1);
    a.onDestroy();
    asset.friction = 0.5;
    expect(sa.setMaterial).toHaveBeenCalledTimes(1);
    expect(sb.setMaterial).toHaveBeenCalledTimes(2);
    b.onDestroy();
});
