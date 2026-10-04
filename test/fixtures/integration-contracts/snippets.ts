// Type-checked manual examples. Call construction only after await createAirApp.
import { Camera, Color, Material, Mesh, MeshRenderer, Node, Scene, Vec3, gfx, primitives, utils } from '../../../src';

export function makePrimitive(scene: Scene) {
    const node = new Node('Primitive'); scene.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    const mesh = utils.createMesh(primitives.box());
    const material = new Material(); material.initialize({ effectName: 'builtin-unlit' });
    material.setProperty('mainColor', new Color(230, 30, 20, 255));
    renderer.mesh = mesh; renderer.setSharedMaterial(material, 0);
    return { node, renderer, mesh, material };
}

export function inspectMesh(mesh: Mesh) {
    return { bytes: mesh.data.byteLength, struct: mesh.struct,
        uv: mesh.readAttribute(0, gfx.AttributeName.ATTR_TEX_COORD) };
}

export function screenPoint(camera: Camera, x: number, y: number) {
    // Public component: input first. Its native render-camera uses output first.
    const input = new Vec3(x, y, 0), component = camera.screenToWorld(input);
    const native = camera.camera.screenToWorld(new Vec3(), input);
    return { component, native };
}

export function hide(node: Node, renderer: MeshRenderer) {
    renderer.enabled = false; // stop only this renderer
    node.active = false; // stop this node and its children
}

export function lookUp(cameraNode: Node) {
    const p = cameraNode.worldPosition;
    cameraNode.lookAt(new Vec3(p.x, p.y + 1, p.z - 10));
}
