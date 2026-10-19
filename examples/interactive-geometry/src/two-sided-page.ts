export interface PageGeometry {
    positions: Float32Array;
    normals: Float32Array;
    uvs: Float32Array;
    indices16: Uint16Array;
}
/** A page surface, not a page-turn controller. Front/back identity is independent of the angle. */
export function createTwoSidedPage(angle: number, segments = 24): { front: PageGeometry; back: PageGeometry } {
    if (!Number.isFinite(angle) || angle < 0 || angle > Math.PI) throw new RangeError('angle must be in [0, PI]');
    if (!Number.isInteger(segments) || segments < 2 || segments > 4096)
        throw new RangeError('segments must be 2..4096');
    const count = (segments + 1) * 2;
    const make = (): PageGeometry => ({
        positions: new Float32Array(count * 3),
        normals: new Float32Array(count * 3),
        uvs: new Float32Array(count * 2),
        indices16: new Uint16Array(segments * 6),
    });
    const front = make(),
        back = make(),
        curvature = Math.sin(angle) * 0.45;
    for (let column = 0; column <= segments; column++) {
        const u = column / segments,
            distance = u * 1.6,
            tangent = angle + curvature * distance;
        const x =
            Math.abs(curvature) < 1e-8 ? distance * Math.cos(angle) : (Math.sin(tangent) - Math.sin(angle)) / curvature;
        const z =
            Math.abs(curvature) < 1e-8 ? distance * Math.sin(angle) : (Math.cos(angle) - Math.cos(tangent)) / curvature;
        for (let row = 0; row < 2; row++) {
            const vertex = column * 2 + row;
            front.positions.set([x, row * 2 - 1, z], vertex * 3);
            back.positions.set([x, row * 2 - 1, z], vertex * 3);
            front.normals.set([-Math.sin(tangent), 0, Math.cos(tangent)], vertex * 3);
            back.normals.set([Math.sin(tangent), 0, -Math.cos(tangent)], vertex * 3);
            front.uvs.set([u, row], vertex * 2);
            back.uvs.set([1 - u, row], vertex * 2);
        }
        if (column < segments) {
            const a = column * 2,
                b = a + 2;
            front.indices16.set([a, b, a + 1, a + 1, b, b + 1], column * 6);
            back.indices16.set([a, a + 1, b, a + 1, b + 1, b], column * 6);
        }
    }
    return { front, back };
}
/** Native upload contract; supply two separately owned dynamic Mesh/renderer pairs. */
export function uploadTwoSidedPage(
    angle: number,
    front: {
        mesh: { updateSubMesh(index: number, geometry: PageGeometry): void };
        renderer: { onGeometryChanged(): void };
    },
    back: {
        mesh: { updateSubMesh(index: number, geometry: PageGeometry): void };
        renderer: { onGeometryChanged(): void };
    },
): ReturnType<typeof createTwoSidedPage> {
    const geometry = createTwoSidedPage(angle);
    for (const side of ['front', 'back'] as const) {
        const target = side === 'front' ? front : back;
        target.mesh.updateSubMesh(0, geometry[side]);
        target.renderer.onGeometryChanged();
    }
    return geometry;
}
