import { Node, Camera, MeshRenderer, Vec3, geometry } from '../../src';
import { frameObject } from '../../src/air/utils/frame-object';

// Known world-space bounds isolate camera fitting from GPU model initialization.
function fixture (projection = Camera.ProjectionType.PERSPECTIVE) {
    const target = new Node('target');
    const bounds = geometry.AABB.create(4, 2, 0, 2, 2, 2);
    jest.spyOn(target, 'getComponent').mockReturnValue(null);
    jest.spyOn(target, 'getComponentsInChildren').mockReturnValue([
        { model: { worldBounds: bounds, updateWorldBound () {} } } as unknown as MeshRenderer,
    ]);
    const parent = new Node('camera-parent'); parent.setPosition(20, 0, 0);
    const node = new Node('camera'); parent.addChild(node); node.setWorldPosition(4, 2, 10);
    const camera = node.addComponent(Camera); camera.projection = projection;
    jest.spyOn(camera, 'camera', 'get').mockReturnValue({ aspect: 0.5 } as any);
    return { camera, target, bounds };
}

afterEach(() => jest.restoreAllMocks());
test('framing uses world coordinates when the camera has a parent', () => {
    const { camera, target } = fixture(); frameObject(camera, target);
    expect(camera.node.worldPosition.x).toBeCloseTo(4);
    expect(camera.node.worldPosition.y).toBeCloseTo(2);
});
test('orthographic fitting adjusts height for a portrait viewport', () => {
    const { camera, target, bounds } = fixture(Camera.ProjectionType.ORTHO);
    camera.orthoHeight = 0.1; frameObject(camera, target);
    expect(camera.orthoHeight * 0.5).toBeGreaterThanOrEqual(bounds.halfExtents.length());
});
test('perspective fitting uses the narrower horizontal field of view', () => {
    const { camera, target, bounds } = fixture(); camera.fov = 60;
    camera.node.parent!.setPosition(0, 0, 0); camera.node.setWorldPosition(4, 2, 10);
    frameObject(camera, target);
    const distance = Vec3.distance(camera.node.worldPosition, bounds.center);
    const halfAngle = Math.atan(Math.tan(Math.PI / 6) * 0.5);
    expect(distance * Math.sin(halfAngle)).toBeGreaterThanOrEqual(bounds.halfExtents.length());
});
