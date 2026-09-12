import * as cc from '../../src';
import { inspectRuntimeAssets, validateRuntimeAssets } from '../../tools/verify/runtime-assets';

describe('read-only runtime asset inspection', () => {
    beforeAll(async () => { await cc.createAirApp({ canvas: '#GameCanvas', renderMode: 3 }); });
    test('collects live native references without creating material instances', () => {
        const root = new cc.Node('Root');
        const node = new cc.Node('Model'); root.addChild(node);
        const renderer = node.addComponent(cc.MeshRenderer);
        renderer.mesh = cc.utils.createMesh(cc.primitives.box({}));
        const material = new cc.Material(); renderer.setSharedMaterial(material, 0);
        // A real Material with no effect must fail, not silently receive a builtin.
        const report = inspectRuntimeAssets(root, cc);
        expect(report.counts.Mesh).toBe(1); expect(report.counts.Material).toBe(1);
        expect(report.diagnostics.map((d) => d.code)).toContain('MISSING_EFFECT');
        expect(renderer.sharedMaterials[0]).toBe(material);
        expect(() => validateRuntimeAssets(root, cc)).toThrow(/MISSING_EFFECT/);
    });
    test('valid empty graph and destroyed/wrong-type collection entries are distinct', () => {
        const root = new cc.Node('Root');
        expect(validateRuntimeAssets(root, cc).ok).toBe(true);
        const report = inspectRuntimeAssets(root, cc, { textures: [new cc.Mesh()] });
        expect(report.ok).toBe(false); expect(report.diagnostics[0].code).toBe('TYPE_MISMATCH');
        const dead = new cc.Mesh(); dead.destroy();
        expect(inspectRuntimeAssets(root, cc, { meshes: [dead] }).diagnostics[0].code).toBe('DESTROYED_RESOURCE');
    });
    test('missing mesh, skin joints and animation targets are actionable', () => {
        const root = new cc.Node('Root');
        const renderer = root.addComponent(cc.SkinnedMeshRenderer);
        renderer.skinningRoot = root;
        const skeleton = new cc.Skeleton(); skeleton.joints = ['missing']; skeleton.bindposes = [];
        renderer.skeleton = skeleton;
        const clip = new cc.AnimationClip(); clip.duration = 1;
        const track = new cc.animation.VectorTrack();
        track.path.toHierarchy('missing').toProperty('position'); clip.addTrack(track);
        root.addComponent(cc.Animation).clips = [clip];
        const codes = inspectRuntimeAssets(root, cc).diagnostics.map((d) => d.code);
        expect(codes).toEqual(expect.arrayContaining(['MISSING_DEPENDENCY', 'BINDPOSE_COUNT', 'JOINT_REFERENCE', 'ANIMATION_TARGET']));
    });
});
