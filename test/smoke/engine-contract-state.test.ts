import { createAirApp } from '../../src';
import { createAirDiagnostics } from '../../src/air/diagnostics';
import { Node } from '../../src/cocos/scene-graph/node';
import { Vec3, Quat } from '../../src/cocos/core/math';
import { Fog, FogType, FOG_TYPE_NONE } from '../../src/cocos/render-scene/scene/fog';
import { FogInfo } from '../../src/cocos/scene-graph/scene-globals';
import { director } from '../../src/cocos/game/director';
import { Animation } from '../../src/cocos/animation/animation-component';
import { AnimationClip } from '../../src/cocos/animation/animation-clip';
import { VectorTrack } from '../../src/cocos/animation/tracks/vector-track';
import { TrackPath } from '../../src/cocos/animation/tracks/track';
import { inspectAirAnimationControllers } from '../../src/air/rendering/engine-contracts';

describe('native fog, TRS and controller contracts', () => {
    beforeAll(async () => { document.body.innerHTML = '<canvas id="GameCanvas"></canvas>'; await createAirApp({ canvas: '#GameCanvas', renderMode: 3 }); });
    afterEach(() => jest.restoreAllMocks());
    test('fog remembers disabled type and uses NONE only as effective pipeline state', () => {
        const macros: any = {}, root = { pipeline: { macros }, onGlobalPipelineStateChanged: jest.fn() };
        jest.spyOn(director, 'root', 'get').mockReturnValue(root as any);
        const fog = new Fog(); fog.type = FogType.EXP; expect(fog.type).toBe(FOG_TYPE_NONE);
        fog.enabled = true; expect(fog.type).toBe(FogType.EXP); expect(macros.CC_USE_FOG).toBe(FogType.EXP);
        fog.enabled = false; expect(macros.CC_USE_FOG).toBe(FOG_TYPE_NONE);
        fog.enabled = true; expect(fog.type).toBe(FogType.EXP);
        const other = new Fog(); other.enabled = true; other.type = FogType.EXP;
        expect(other.type).toBe(fog.type);
        const info = new FogInfo(), native = new Fog(); (info as any)._resource = native;
        info.type = FogType.EXP_SQUARED; info.enabled = true; expect(native.type).toBe(FogType.EXP_SQUARED);
        expect(() => { fog.type = 99; }).toThrow('AIR_E_FOG_TYPE'); expect(fog.type).toBe(FogType.EXP);
    });
    test('invalid local/world TRS is rejected before poisoning transforms or emitting change events', () => {
        const node = new Node('finite'); node.setPosition(2, 3, 4); node.setScale(2, 2, 2);
        const before = node.getWorldMatrix().clone();
        expect(() => node.setScale([2, 2, 2] as any)).toThrow('AIR_E_NODE_TRANSFORM');
        expect(() => (node.setScale as any)(2)).toThrow('AIR_E_NODE_TRANSFORM');
        expect(() => node.setPosition(Infinity, 0, 0)).toThrow('AIR_E_NODE_TRANSFORM');
        const badRotation = new Quat(); badRotation.x = NaN;
        expect(() => node.setRotation(badRotation)).toThrow('AIR_E_NODE_TRANSFORM');
        expect(() => node.setRotationFromEuler(NaN, 0, 0)).toThrow('AIR_E_NODE_TRANSFORM');
        expect(() => node.setWorldScale(new Vec3(1, Infinity, 1))).toThrow('AIR_E_NODE_TRANSFORM');
        expect(node.getWorldMatrix()).toEqual(before); node.destroy();
    });
    test('valid scale and degree rotation affect actual transformed coordinates', () => {
        const parent = new Node(), child = new Node(); parent.addChild(child);
        parent.setScale(2, 3, 1); child.setPosition(1, 1, 0);
        expect(child.getWorldPosition()).toEqual(new Vec3(2, 3, 0));
        parent.setRotationFromEuler(0, 0, 90); const rotated = child.getWorldPosition();
        expect(rotated.x).toBeCloseTo(-3); expect(rotated.y).toBeCloseTo(2); parent.destroy();
    });
    test('duplicate same-node Animation is diagnosed without preventing independent components', () => {
        const diagnostics = createAirDiagnostics('warnings'), node = new Node('duplicate');
        const a = node.addComponent(Animation), b = node.addComponent(Animation);
        a.onLoad(); b.onLoad();
        const warnings = diagnostics.snapshot().filter(x => x.message.includes('AIR_W_ANIMATION_CONTROLLERS'));
        expect(warnings.length).toBe(1); expect(warnings[0].occurrences).toBe(2);
        expect(node.getComponents(Animation)).toEqual([a, b]); diagnostics.destroy(); node.destroy();
    });
    test('readonly controller inspection resolves actual shared targets across distinct roots', () => {
        const root = new Node('root'), child = new Node('shared'); root.addChild(child);
        const a = root.addComponent(Animation), b = child.addComponent(Animation);
        const clip = (name: string, nested: boolean) => {
            const c = new AnimationClip(); c.name = name; c.duration = 1;
            const track = new VectorTrack(); track.path = nested ? new TrackPath().toHierarchy('shared').toProperty('position') : new TrackPath().toProperty('position');
            c.addTrack(track); return c;
        };
        a.clips = [clip('a', true)]; b.clips = [clip('b', false)];
        const before = Object.keys((a as any)._nameToState); const report = inspectAirAnimationControllers(root);
        expect(report.controllerCount).toBe(2); expect(report.conflicts.length).toBe(1);
        expect((report.conflicts[0][0] as any).target).toBe(child.uuid);
        expect(Object.keys((a as any)._nameToState)).toEqual(before); root.destroy();
    });
});
