const { createAirApp } = await import('/build/cocosair.module.js');
const app = await createAirApp({ canvas: '#GameCanvas' });
const { Scene, Node, Camera, MeshRenderer, Material, Color, Vec3, primitives, utils, director, game } = await import('/build/cocosair.module.js');
const scene = new Scene('ControlBasis'), cameraNode = new Node('Camera'), vehicle = new Node('Vehicle');
scene.addChild(cameraNode); scene.addChild(vehicle); vehicle.setRotationFromEuler(0, 90, 0);
const camera = cameraNode.addComponent(Camera); camera.projection = Camera.ProjectionType.ORTHO; camera.orthoHeight = 4;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(0, 0, 0, 255);
const mesh = utils.createMesh(primitives.box({ width: .25, height: .25, length: .25 }));
const colors = [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 0, 255]];
const markers = ['world', 'vehicle', 'screen-forward', 'screen-right'].map((id, i) => {
    const node = new Node(id), renderer = node.addComponent(MeshRenderer), material = new Material();
    material.initialize({ effectName: 'builtin-unlit' }); material.setProperty('mainColor', new Color(...colors[i]));
    renderer.mesh = mesh; renderer.setSharedMaterial(material, 0); scene.addChild(node); return { id, node, material, color: colors[i] };
});
app.session.own(() => { mesh.destroy(); markers.forEach((marker) => marker.material.destroy()); }, 'basis-markers');
app.run(scene); game.pause();
function sample(angle) {
    cameraNode.setPosition(6 * Math.sin(angle), 6, 6 * Math.cos(angle)); cameraNode.lookAt(new Vec3());
    const flat = (basis) => new Vec3(basis.x, 0, basis.z).normalize();
    const directions = [new Vec3(0, 0, -1), vehicle.forward.clone(), flat(cameraNode.forward), flat(cameraNode.right)];
    markers.forEach((marker, i) => marker.node.setPosition(directions[i].clone().multiplyScalar(2)));
    // Coincident modes are rendered separately, so color visibility cannot be hidden by another mode.
    const observations = [];
    for (let i = 0; i < markers.length; i++) {
        markers.forEach((marker, index) => { marker.node.active = index === i; }); director.tick(0);
        const origin = camera.worldToScreen(new Vec3()), projected = camera.worldToScreen(markers[i].node.worldPosition);
        const gl = app.canvas.getContext('webgl2'), pixel = new Uint8Array(4);
        gl.readPixels(Math.floor(projected.x), Math.floor(projected.y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        observations.push({ id: markers[i].id, direction: [directions[i].x, directions[i].y, directions[i].z],
            projectedDelta: [projected.x - origin.x, projected.y - origin.y], color: markers[i].color, pixel: Array.from(pixel) });
    }
    markers.forEach((marker) => { marker.node.active = true; }); director.tick(0);
    return { observations, cameraForward: [cameraNode.forward.x, cameraNode.forward.y, cameraNode.forward.z],
        vehicleForward: [vehicle.forward.x, vehicle.forward.y, vehicle.forward.z], cameraDefaultWidth: camera.orthoWidth };
}
window.__basisProbe = { ready: true, sample, release: () => app.releaseScene() };
