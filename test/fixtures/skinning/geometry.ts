import { Mesh, Skeleton, Mat4, utils, gfx } from '../../../src';

/** Non-symmetric triangle: real native mesh data, float joints/weights, one unused joint. */
export function skinnedTriangle (shift = 0, joint = 0, weight = 1): Mesh {
    return utils.createMesh({
        positions: [-1 + shift, 0, 0, 2 + shift, 0, 0, shift, 3, 0],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        uvs: [0, 0, 1, 0, 0.3, 1],
        indices: [0, 1, 2],
        minPos: { x: -1 + shift, y: 0, z: 0 },
        maxPos: { x: 2 + shift, y: 3, z: 0 },
        customAttributes: [
            { attr: new gfx.Attribute(gfx.AttributeName.ATTR_JOINTS, gfx.Format.RGBA32F),
                values: [joint, 0, 0, 0, joint, 0, 0, 0, joint, 0, 0, 0] },
            { attr: new gfx.Attribute(gfx.AttributeName.ATTR_WEIGHTS, gfx.Format.RGBA32F),
                values: [weight, 0, 0, 0, weight, 0, 0, 0, weight, 0, 0, 0] },
        ],
    });
}

export function triangleSkeleton (): Skeleton {
    const skeleton = new Skeleton('triangleSkeleton');
    skeleton.joints = ['Bone', 'Unused'];
    skeleton.bindposes = [new Mat4(), new Mat4()];
    return skeleton;
}
