/** Original procedural faceted geometry. Every face owns a flat normal; no model downloads. */
export function gemDocument(): { json: string; faceCount: number } {
    const sectors = 12;
    const rings = [
        { y: 1.05, r: 0.65 },
        { y: 0.5, r: 1.32 },
        { y: 0, r: 1.5 },
        { y: -0.75, r: 0.85 },
        { y: -1.2, r: 0 },
    ];
    const positions: number[] = [],
        normals: number[] = [];
    const point = (ring: (typeof rings)[number], i: number): number[] => [
        Math.cos((i * Math.PI * 2) / sectors) * ring.r,
        ring.y,
        Math.sin((i * Math.PI * 2) / sectors) * ring.r,
    ];
    function triangle(a: number[], b: number[], c: number[]): void {
        const ab = b.map((v, i) => v - a[i]),
            ac = c.map((v, i) => v - a[i]);
        let n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
        const length = Math.hypot(...n);
        if (length < 1e-8) return;
        const center = a.map((v, i) => (v + b[i] + c[i]) / 3);
        if (n.reduce((sum, v, i) => sum + v * center[i], 0) < 0) {
            [b, c] = [c, b];
            n = n.map((v) => -v);
        }
        positions.push(...a, ...b, ...c);
        for (let i = 0; i < 3; i++) normals.push(...n.map((v) => v / length));
    }
    for (let ring = 0; ring < rings.length - 1; ring++)
        for (let i = 0; i < sectors; i++) {
            const a = point(rings[ring], i),
                b = point(rings[ring], i + 1),
                c = point(rings[ring + 1], i),
                d = point(rings[ring + 1], i + 1);
            triangle(a, b, c);
            triangle(b, d, c);
        }
    for (let i = 0; i < sectors; i++) triangle([0, rings[0].y, 0], point(rings[0], i), point(rings[0], i + 1));
    const bytes = new Uint8Array((positions.length + normals.length) * 4);
    new Float32Array(bytes.buffer).set(positions);
    new Float32Array(bytes.buffer).set(normals, positions.length);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const document = {
        asset: { version: '2.0', generator: 'Cocos AIR original procedural gem' },
        extensionsUsed: [
            'KHR_materials_transmission',
            'KHR_materials_volume',
            'KHR_materials_ior',
            'KHR_materials_dispersion',
        ],
        buffers: [{ byteLength: bytes.byteLength, uri: `data:application/octet-stream;base64,${btoa(binary)}` }],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: positions.length * 4 },
            { buffer: 0, byteOffset: positions.length * 4, byteLength: normals.length * 4 },
        ],
        accessors: [
            {
                bufferView: 0,
                componentType: 5126,
                count: positions.length / 3,
                type: 'VEC3',
                min: [-1.5, -1.2, -1.5],
                max: [1.5, 1.05, 1.5],
            },
            { bufferView: 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
        ],
        materials: [
            {
                name: 'Optical crystal',
                alphaMode: 'OPAQUE',
                doubleSided: false,
                pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.06 },
                extensions: {
                    KHR_materials_transmission: { transmissionFactor: 0.95 },
                    KHR_materials_volume: {
                        thicknessFactor: 3,
                        attenuationColor: [0.93, 0.96, 1],
                        attenuationDistance: 8,
                    },
                    KHR_materials_ior: { ior: 2.1 },
                    KHR_materials_dispersion: { dispersion: 7 },
                },
            },
        ],
        meshes: [
            { name: 'Faceted crystal', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0, mode: 4 }] },
        ],
        nodes: [{ name: 'Gemstone', mesh: 0 }],
        scenes: [{ nodes: [0] }],
        scene: 0,
    };
    return { json: JSON.stringify(document), faceCount: positions.length / 9 };
}
