import { Node, Vec3, Quat, Mat4, isValid } from 'cocosair';

/** Isolated hierarchy with known arithmetic; no renderer or shared assets. */
export async function verifyTransforms(): Promise<void> {
    const probe = { ready: false, ok: false, checks: [] as { name: string; ok: boolean; detail: string }[] };
    (window as any).__trialProbe = probe;
    const check = (name: string, ok: boolean, detail = '') => {
        probe.checks.push({ name, ok, detail });
        if (!ok) throw new Error(`${name}: ${detail}`);
    };
    const vector = (name: string, value: Readonly<Vec3>, x: number, y: number, z: number) =>
        check(name, Vec3.distance(value, new Vec3(x, y, z)) < 0.0001, `${value.x},${value.y},${value.z}`);
    const root = new Node('ContractRoot');
    const child = new Node('Probe');
    root.addChild(child);
    try {
        root.setRTS(Quat.fromEuler(new Quat(), 0, 0, 90), new Vec3(10, 0, 0), new Vec3(2, 2, 2));
        child.setPosition(1, 0, 0);
        vector('local-position', child.getPosition(new Vec3()), 1, 0, 0);
        vector('rotated-scaled-world-position', child.getWorldPosition(new Vec3()), 10, 2, 0);
        vector('inverse-world-origin', child.inverseTransformPoint(new Vec3(), new Vec3(10, 2, 0)), 0, 0, 0);
        child.setWorldPosition(new Vec3(10, 4, 0));
        vector('world-position-updates-local', child.getPosition(), 2, 0, 0);
        child.setWorldScale(new Vec3(4, 6, 8));
        vector('world-scale', child.getWorldScale(), 4, 6, 8);
        vector('local-scale-under-parent', child.getScale(new Vec3()), 2, 3, 4);
        child.setRotation(new Quat());
        check('local-rotation', Quat.equals(child.getRotation(new Quat()), new Quat()));
        child.setWorldRotation(new Quat());
        check('world-rotation', Quat.equals(child.getWorldRotation(new Quat()), new Quat()));
        child.setWorldRotationFromEuler(0, 0, 90);
        check('world-euler', Quat.equals(child.getWorldRotation(), Quat.fromEuler(new Quat(), 0, 0, 90)));
        child.translate(new Vec3(1, 0, 0));
        vector('local-translate-under-parent', child.getWorldPosition(), 10, 6, 0);
        child.rotate(Quat.fromEuler(new Quat(), 0, 0, 90));
        check('local-rotate', Quat.equals(child.getRotation(), Quat.fromEuler(new Quat(), 0, 0, 90)));
        child.updateWorldTransform();
        const matrix = child.getWorldMatrix(new Mat4());
        vector('world-matrix-origin', Vec3.transformMat4(new Vec3(), Vec3.ZERO, matrix), 10, 6, 0);
        const rs = child.getWorldRS(new Mat4());
        vector('rotation-scale-excludes-translation', new Vec3(rs.m12, rs.m13, rs.m14), 0, 0, 0);
        check('rotation-scale-keeps-scale', Math.abs(Math.hypot(rs.m00, rs.m01, rs.m02) - 4) < 0.0001);
        const rt = child.getWorldRT(new Mat4());
        vector('rotation-translation-keeps-position', new Vec3(rt.m12, rt.m13, rt.m14), 10, 6, 0);
        check('rotation-translation-excludes-scale', Math.abs(Math.hypot(rt.m00, rt.m01, rt.m02) - 1) < 0.0001);
        check('hierarchy-path', child.getPathInHierarchy().endsWith('ContractRoot/Probe'), child.getPathInHierarchy());

        root.attr({ name: 'ContractRoot' });
        check('node-attr', root.name === 'ContractRoot', root.name);
        const nodeReads: Record<string, unknown> = {
            'Node.components': root.components,
            'Node.name': root.name,
            'Node.uuid': root.uuid,
            'Node.children': root.children,
            'Node.active': root.active,
            'Node.activeInHierarchy': root.activeInHierarchy,
            'Node.parent': child.parent,
            'Node.scene': root.scene,
            'Node.EventType': Node.EventType,
            'Node.NodeSpace': Node.NodeSpace,
            'Node.TransformBit': Node.TransformBit,
            'Node.position': child.position,
            'Node.x': child.x,
            'Node.y': child.y,
            'Node.z': child.z,
            'Node.worldPosition': child.worldPosition,
            'Node.worldPositionX': child.worldPositionX,
            'Node.worldPositionY': child.worldPositionY,
            'Node.worldPositionZ': child.worldPositionZ,
            'Node.rotation': child.rotation,
            'Node.eulerAngles': child.eulerAngles,
            'Node.angle': child.angle,
            'Node.worldRotation': child.worldRotation,
            'Node.scale': child.scale,
            'Node.worldScale': child.worldScale,
            'Node.worldMatrix': child.worldMatrix,
            'Node.forward': child.forward,
            'Node.up': child.up,
            'Node.right': child.right,
            'Node.mobility': child.mobility,
            'Node.layer': child.layer,
            'Node.hasChangedFlags': child.hasChangedFlags,
        };
        for (const [name, value] of Object.entries(nodeReads)) {
            const type = typeof value;
            check(
                `node-read:${name}`,
                value === null ||
                    type === 'boolean' ||
                    type === 'string' ||
                    (typeof value === 'number' && Number.isFinite(value)) ||
                    type === 'object',
                `${type}:${String(value)}`,
            );
        }
        const localMatrix = Mat4.fromRTS(
            new Mat4(),
            child.getRotation(new Quat()),
            child.getPosition(new Vec3()),
            child.getScale(new Vec3()),
        );
        child.matrix = localMatrix;
        vector('node-matrix-setter-keeps-world-position', child.getWorldPosition(new Vec3()), 10, 6, 0);
        check('node-static-isNode', Node.isNode(root) && !Node.isNode({}));
        root.invalidateChildren(Node.TransformBit.POSITION);
        check('node-isTransformDirty', root.isTransformDirty());
        root.pauseSystemEvents(false);
        root.resumeSystemEvents(false);
    } finally {
        root.destroy();
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
    check('scratch-hierarchy-destroyed', !isValid(root) && !isValid(child));
    Node.resetHasChangedFlags();
    Node.clearNodeArray();
    probe.ok = true;
    probe.ready = true;
}
