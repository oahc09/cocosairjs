/** An original AIR verification fixture, not an asset format or a general-purpose cooker. */
'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const { join } = require('node:path');
const { parseArgs } = require('node:util');
const { PNG } = require('pngjs');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function makeTexture(seed) {
    const png = new PNG({ width: 64, height: 64 });
    let state = seed;
    const next = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state >>> 24;
    };
    const tones = Array.from({ length: 16 }, () => [35 + (next() % 185), 35 + (next() % 185), 35 + (next() % 185)]);
    for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
            const rgb = tones[(y >> 4) * 4 + (x >> 4)];
            const seam = x % 16 < 2 || y % 16 < 2;
            const grain = next() % 17;
            for (let c = 0; c < 3; c++) png.data[(y * 64 + x) * 4 + c] = seam ? 19 : rgb[c] + grain;
            png.data[(y * 64 + x) * 4 + 3] = 255;
        }
    }
    return PNG.sync.write(png);
}

function makeGeometry() {
    const outline = [
        [-0.84, -0.68],
        [0.84, -0.68],
        [1, -0.52],
        [1, 0.52],
        [0.84, 0.68],
        [-0.84, 0.68],
        [-1, 0.52],
        [-1, -0.52],
    ];
    const rings = [
        [0.89, 0.13],
        [1, 0.04],
        [1, -0.04],
        [0.89, -0.13],
    ].map(([scale, z]) => outline.map(([x, y]) => [x * scale, y * scale, z]));
    const positions = [],
        normals = [],
        uv = [];
    function triangle(a, b, c) {
        const u = b.map((v, i) => v - a[i]),
            v = c.map((q, i) => q - a[i]);
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const length = Math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2);
        for (const p of [a, b, c]) {
            positions.push(...p);
            normals.push(...n.map((q) => q / length));
            uv.push(p[0] / 2 + 0.5, 0.5 - p[1] / 1.36);
        }
    }
    for (let i = 0; i < 8; i++) {
        const j = (i + 1) % 8;
        triangle([0, 0, 0.13], rings[0][i], rings[0][j]);
        for (let k = 0; k + 1 < rings.length; k++) {
            triangle(rings[k][i], rings[k + 1][i], rings[k + 1][j]);
            triangle(rings[k][i], rings[k + 1][j], rings[k][j]);
        }
        triangle([0, 0, -0.13], rings[3][j], rings[3][i]);
    }
    return [positions, normals, uv];
}

function makeGlb(png) {
    const arrays = makeGeometry();
    const parts = arrays.map((list) => {
        const part = Buffer.alloc(4 * list.length);
        list.forEach((value, i) => part.writeFloatLE(value, i * 4));
        return part;
    });
    parts.push(png);
    let offset = 0;
    const bufferViews = parts.map((part, i) => {
        const out = { buffer: 0, byteOffset: offset, byteLength: part.length, ...(i < 3 ? { target: 34962 } : {}) };
        offset += part.length;
        return out;
    });
    const accessor = (index, count, type) => ({ bufferView: index, componentType: 5126, count, type });
    const count = arrays[0].length / 3;
    const min = [0, 1, 2].map((axis) => Math.min(...arrays[0].filter((_, i) => i % 3 === axis).map(Math.fround)));
    const max = [0, 1, 2].map((axis) => Math.max(...arrays[0].filter((_, i) => i % 3 === axis).map(Math.fround)));
    const json = {
        asset: { version: '2.0', generator: 'AIR seeded-material-panel/v1' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ name: 'SeededPanel', mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, material: 0 }] }],
        materials: [
            {
                name: 'SeededTiles',
                pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.7 },
            },
        ],
        textures: [{ source: 0 }],
        images: [{ bufferView: 3, mimeType: 'image/png' }],
        buffers: [{ byteLength: offset }],
        bufferViews,
        accessors: [
            { ...accessor(0, count, 'VEC3'), min, max },
            accessor(1, count, 'VEC3'),
            accessor(2, count, 'VEC2'),
        ],
    };
    const chunk = (bytes, type, pad) => {
        const size = Math.ceil(bytes.length / 4) * 4;
        const out = Buffer.alloc(8 + size, pad);
        out.writeUInt32LE(size, 0);
        out.writeUInt32LE(type, 4);
        bytes.copy(out, 8);
        return out;
    };
    const desc = chunk(Buffer.from(JSON.stringify(json)), 0x4e4f534a, 32);
    const bin = chunk(Buffer.concat(parts), 0x004e4942, 0);
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(header.length + desc.length + bin.length, 8);
    return Buffer.concat([header, desc, bin]);
}

function recipe(seed) {
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
        throw new Error('Seed must be an unsigned 32-bit integer.');
    const png = makeTexture(seed);
    const files = { 'tiles.png': png, 'panel.glb': makeGlb(png) };
    const receipt = {
        schema: 'air-seeded-material-panel-v1',
        generatorSha256: sha256(fs.readFileSync(__filename)),
        toolchain: {
            node: process.versions.node,
            zlib: process.versions.zlib,
            pngjs: require('pngjs/package.json').version,
        },
        parameters: { seed, textureSize: [64, 64], outline: 'beveled-octagon-v1' },
        outputs: Object.fromEntries(
            Object.entries(files).map(([name, bytes]) => [name, { bytes: bytes.length, sha256: sha256(bytes) }]),
        ),
    };
    return { files, receipt, receiptBytes: Buffer.from(JSON.stringify(receipt, null, 2) + '\n') };
}

function checkedPanel(directory, seed) {
    const { files, receipt, receiptBytes } = recipe(seed);
    const exact = (name, expected) => {
        const path = join(directory, name);
        if (fs.lstatSync(path).size !== expected.length || !fs.lstatSync(path).isFile())
            throw new Error('ASSET_MISMATCH: ' + name);
        const actual = fs.readFileSync(path);
        if (!actual.equals(expected)) throw new Error('ASSET_MISMATCH: ' + name);
        return actual;
    };
    exact('fixture.json', receiptBytes);
    for (const [name, expected] of Object.entries(files)) files[name] = exact(name, expected);
    return { files, receipt };
}

if (require.main === module) {
    const [command, ...args] = process.argv.slice(2);
    const { values } = parseArgs({ args, options: { out: { type: 'string' }, seed: { type: 'string' } } });
    if (!['generate', 'check'].includes(command) || !values.out || !/^\d+$/.test(values.seed ?? ''))
        throw new Error('Usage: seeded-material-panel.cjs generate|check --seed UINT32 --out DIRECTORY');
    const seed = Number(values.seed);
    if (command === 'generate') {
        const { files, receiptBytes } = recipe(seed);
        fs.mkdirSync(values.out);
        for (const [name, bytes] of Object.entries(files))
            fs.writeFileSync(join(values.out, name), bytes, { flag: 'wx' });
        fs.writeFileSync(join(values.out, 'fixture.json'), receiptBytes, { flag: 'wx' });
    }
    console.log(JSON.stringify(checkedPanel(values.out, seed).receipt));
}
module.exports = { checkedPanel };
