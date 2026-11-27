import { readFileSync } from 'fs';
import { resolve } from 'path';
import { convexClipOutline } from '../../src/air/bone2d/polygon';
import { factorBone2dBasis, multiplyBasis, poseBasis } from '../../src/air/bone2d/affine';
import {
    parseBone2dProject,
    sampleBone2dProject,
    bone2dWorldMatrices,
    bone2dMeshPositions,
    bone2dPicture,
    bone2dShapeGeometry,
} from '../../src/air/bone2d/project';

const text = readFileSync(resolve(__dirname, '../fixtures/bone2d/clawbot.bone2d'), 'utf8');
const fixture = (): any => JSON.parse(text);
const parse = (value: unknown) => parseBone2dProject(JSON.stringify(value));

test('samples native projects without DOM and respects setup, stepped, eased and discrete channels', () => {
    const model = parseBone2dProject(text);
    expect(sampleBone2dProject(model, 'attack', 0.125).bones.get('arm-bone')).toEqual([6, 0, 0, 1, 1]);
    expect(sampleBone2dProject(model, 'attack', 0.375).bones.get('arm-bone')).toEqual([16, 0, 0, 1, 1]);
    expect(sampleBone2dProject(model, 'attack', 0.5).bones.get('arm-bone')).toEqual([26, 0, 45, 1, 1]);
    expect(sampleBone2dProject(model, 'attack', 0.5).order).toEqual(['arm-slot', 'body-slot']);
    expect(sampleBone2dProject(model, 'attack', 0.875).slots.get('arm-slot')?.attachment).toBeNull();
    expect(sampleBone2dProject(model, 'idle', 0.25).bones.get('arm-bone')?.[2]).toBeCloseTo(4);
    expect(sampleBone2dProject(model, 'idle', 0.125).bones.get('arm-bone')?.[2]).toBeLessThan(2);
    expect(sampleBone2dProject(model, 'idle', 1).slots.get('arm-slot')?.attachment).toBe('arm');
});
test('preserves event identity through a label rename; preserves typed overrides but not authoring audio', () => {
    const data = fixture();
    data.project.skeleton.events[1].name = 'Strike';
    const markers = parse(data).clips.get('attack')!.markers;
    expect(markers[1].value).toEqual({ id: 'ev-impact', name: 'Strike', int: 2, float: 0, string: '', time: 0.5 });
});
test.each([
    [
        'dangling parent',
        (d) => {
            d.project.skeleton.bones[0].parent = 'absent';
        },
        /FORMAT/,
    ],
    [
        'cyclic parent',
        (d) => {
            d.project.skeleton.bones[1].parent = 'arm-bone';
        },
        /FORMAT/,
    ],
    [
        'unsupported version',
        (d) => {
            d.project.version = 2;
        },
        /UNSUPPORTED/,
    ],
    [
        'malformed clipping shape',
        (d) => {
            d.project.skeleton.skins[0].attachments['body-slot'].body.type = 'clipping';
        },
        /FORMAT/,
    ],
    [
        'unknown image',
        (d) => {
            d.project.images.pop();
        },
        /FORMAT/,
    ],
    [
        'duplicate key time',
        (d) => {
            d.project.skeleton.animations[0].bones['arm-bone'].rotate[1].time = 0;
        },
        /FORMAT/,
    ],
    [
        'unsupported constraints',
        (d) => {
            d.project.skeleton.constraints.push({ type: 'path' });
        },
        /UNSUPPORTED/,
    ],
    [
        'malformed draw order',
        (d) => {
            d.project.skeleton.animations[1].drawOrder[0].order = ['arm-slot', 'arm-slot'];
        },
        /FORMAT/,
    ],
] as const)('rejects %s without producing a partial project', (_case, mutate, pattern) => {
    const data = fixture();
    mutate(data);
    expect(() => parse(data)).toThrow(pattern);
});

test('restores editor skeleton order, defaults to saved active rig, and accepts indexed selection', () => {
    const d = fixture();
    const p = d.project;
    p.others = [
        { ...p.skeleton, name: 'Earlier rig' },
        { ...p.skeleton, name: 'Later rig' },
    ];
    p.activeAt = 1;
    p.others[0].animations = [{ ...p.skeleton.animations[0], id: 'different' }];
    const text = JSON.stringify(d);
    const active = parseBone2dProject(text);
    expect(active.skeletonNames).toEqual(['Earlier rig', 'Clawbot', 'Later rig']);
    expect(active.skeletonIndex).toBe(1);
    expect([...active.clips.keys()]).toEqual(['idle', 'attack']);
    expect([...parseBone2dProject(text, { skeletonIndex: 0 }).clips.keys()]).toEqual(['different']);
    expect(() => parseBone2dProject(text, { skeletonIndex: 3 })).toThrow(/FORMAT/);
});

test('validates skin member references and retains overlay attachment names, not just default-skin names', () => {
    const d = fixture();
    const rig = d.project.skeleton;
    const arm = rig.skins[0].attachments['arm-slot'].arm;
    rig.skins.push({
        id: 'glove',
        name: 'Glove',
        bones: [],
        constraints: [],
        attachments: { 'arm-slot': { glove: { ...arm, path: 'body' } } },
    });
    rig.animations[0].slots['arm-slot'] = { attachment: [{ time: 0, name: 'glove' }] };
    expect(sampleBone2dProject(parse(d), 'idle', 0).slots.get('arm-slot')?.attachment).toBe('glove');
    rig.skins[1].attachments.invalid = {};
    expect(() => parse(d)).toThrow(/unknown skin slot/);
});

function meshRig(weighted: boolean): any {
    const d = fixture(),
        rig = d.project.skeleton;
    const points = [
        [0, 0],
        [16, 0],
        [0, 16],
    ];
    const slot = rig.skins[0].attachments['arm-slot'];
    const mesh = {
        type: 'mesh',
        name: 'arm',
        path: 'arm',
        color: [1, 1, 1, 1],
        width: 8,
        height: 8,
        uvs: [0, 1, 1, 1, 0, 0],
        triangles: [0, 1, 2],
        hull: 3,
        edges: [],
        vertices: weighted ? [] : points.flat(),
        weights: weighted
            ? points.map(([x, y]) => [
                  ['root', x, y, 0.25],
                  ['arm-bone', x - 6, y, 0.75],
              ])
            : null,
    };
    slot.arm = mesh;
    const clip = rig.animations[1];
    delete clip.bones['arm-bone'].rotate;
    const n = weighted ? 12 : 6,
        delta = Array(n).fill(0);
    delta[n - 1] = 8;
    clip.deform.skin = {
        'arm-slot': {
            arm: [
                { time: 0, value: Array(n).fill(0), curve: [0.25, 0, 0.75, 1] },
                { time: 0.5, value: delta },
            ],
        },
    };
    return d;
}

test.each([true, false])('builds native mesh positions with shared deform curves (weighted=%s)', (weighted) => {
    const d = meshRig(weighted);
    const p = parse(d);
    const mesh = p.skins.get('skin')!.regions.get('arm-slot')!.get('arm')!;
    if (mesh.kind !== 'mesh') throw new Error('not a mesh');
    const sample = sampleBone2dProject(p, 'attack', 0.5);
    expect(mesh.uvs).toEqual([0, 0, 1, 0, 0, 1]);
    const full = bone2dMeshPositions(mesh, 'arm-bone', bone2dWorldMatrices(p, sample), sample.meshDeltas.get(mesh));
    expect(full).toEqual(weighted ? [22.5, 0, 46.5, 0, 22.5, 22] : [39, 0, 63, 0, 39, 24]);
    const half = sampleBone2dProject(p, 'attack', 0.25);
    expect(half.meshDeltas.get(mesh)?.[mesh.deformSize - 1]).toBeCloseTo(4);
});

test('rejects inconsistent influences, topology and deform dimensions before mounting', () => {
    const d = meshRig(true),
        rig = d.project.skeleton;
    const mesh = rig.skins[0].attachments['arm-slot'].arm;
    mesh.weights[0][0][0] = 'ghost';
    expect(() => parse(d)).toThrow(/unknown influence bone/);
    mesh.weights[0][0][0] = 'root';
    mesh.triangles[2] = 9;
    expect(() => parse(d)).toThrow(/triangle index/);
    mesh.triangles[2] = 2;
    rig.animations[1].deform.skin['arm-slot'].arm[1].value.pop();
    expect(() => parse(d)).toThrow(/deform curve/);
});

test('linked meshes keep independent image and tint, reuse source topology and inherit its deform cursor when enabled', () => {
    const d = meshRig(true),
        rig = d.project.skeleton;
    const base = rig.skins[0].attachments['arm-slot'].arm;
    rig.skins.push({
        id: 'link',
        name: 'Linked glove',
        bones: [],
        constraints: [],
        attachments: {
            'arm-slot': {
                arm: {
                    ...base,
                    path: 'body',
                    link: { source: 'arm', slot: null, skin: null, deform: true },
                    uvs: [0, 0, 1, 0, 1, 1],
                },
            },
        },
    });
    const p = parse(d),
        attached = p.skins.get('link')!.regions.get('arm-slot')!.get('arm')!;
    if (attached.kind !== 'mesh') throw Error('expected mesh');
    const source = p.skins.get('skin')!.regions.get('arm-slot')!.get('arm');
    expect(attached.path).toBe('body');
    expect(attached.uvs).toEqual([0, 0, 1, 0, 0, 1]);
    expect(attached.deformParent).toBe(source);
    const half = sampleBone2dProject(p, 'attack', 0.25);
    expect(half.meshDeltas.get(attached.deformParent!)?.[11]).toBeCloseTo(4);
    rig.skins[1].attachments['arm-slot'].arm.link.source = 'missing';
    expect(() => parse(d)).toThrow(/invalid linked mesh/);
});

test('draw-order folder rearranges only its occupied seats after the full-track order', () => {
    const d = fixture(),
        rig = d.project.skeleton;
    rig.slots.push({ ...rig.slots[0], id: 'between', attachment: null });
    rig.drawOrderFolders = [{ id: 'fx', name: 'Effects', slots: ['body-slot', 'arm-slot'] }];
    const clip = rig.animations[1];
    clip.drawOrder = [{ time: 0, order: ['arm-slot', 'between', 'body-slot'] }];
    clip.drawOrderFolder = { fx: [{ time: 0.5, order: ['arm-slot'] }] };
    const p = parse(d);
    expect(sampleBone2dProject(p, 'attack', 0.25).order).toEqual(['body-slot', 'between', 'arm-slot']);
    expect(sampleBone2dProject(p, 'attack', 0.5).order).toEqual(['arm-slot', 'between', 'body-slot']);
});

function sequenceFixture() {
    const file = fixture(),
        rig = file.project.skeleton;
    const attachment = rig.skins[0].attachments['body-slot'].body;
    attachment.sequence = { count: 3, start: 7, digits: 3, setupIndex: 1 };
    for (const prefix of ['body', 'overlay']) {
        for (const suffix of ['007', '008', '009']) {
            file.project.images.push({ ...file.project.images[0], name: prefix + suffix });
        }
    }
    rig.skins.push({
        ...rig.skins[0],
        id: 'overlay',
        attachments: {
            'body-slot': { body: { ...attachment, path: 'overlay' } },
        },
    });
    const clip = rig.animations[1];
    clip.sequence = {
        skin: { 'body-slot': { body: [{ time: 0.25, index: 0, delay: 0.125, mode: 'pingpong' }] } },
        overlay: { 'body-slot': { body: [{ time: 0.75, index: 0, delay: 0.125, mode: 'onceReverse' }] } },
    };
    return { file, clip, attachment };
}
test.each([
    ['hold', [8, 7, 7, 7, 7, 7, 7]],
    ['once', [8, 7, 8, 9, 9, 9, 9]],
    ['loop', [8, 7, 8, 9, 7, 8, 9]],
    ['pingpong', [8, 7, 8, 9, 8, 7, 8]],
    ['onceReverse', [8, 9, 8, 7, 7, 7, 7]],
    ['loopReverse', [8, 9, 8, 7, 9, 8, 7]],
    ['pingpongReverse', [8, 9, 8, 7, 8, 9, 8]],
])('samples %s across frame boundaries including the setup frame', (mode, expected) => {
    const { file, clip } = sequenceFixture();
    clip.sequence.skin['body-slot'].body[0].mode = mode;
    const model = parse(file);
    const body = model.skins.get('skin')!.regions.get('body-slot')!.get('body')!;
    const pictures = [0, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875].map((t) =>
        bone2dPicture(body, sampleBone2dProject(model, 'attack', t)),
    );
    expect(pictures).toEqual(expected.map((n) => 'body00' + n));
});
test('picture tracks are keyed by exact attachment and keep setup until their own first key', () => {
    const model = parse(sequenceFixture().file);
    const selected = (skin: string, t: number) =>
        bone2dPicture(
            model.skins.get(skin)!.regions.get('body-slot')!.get('body')!,
            sampleBone2dProject(model, 'attack', t),
        );
    expect([
        selected('skin', 0.5),
        selected('overlay', 0.5),
        selected('overlay', 0.75),
        selected('skin', 0.75),
    ]).toEqual(['body009', 'overlay008', 'overlay009', 'body007']);
});
test('handles one picture, zero delay and fails on missing frame or unbound sequence keys', () => {
    const { file, clip, attachment } = sequenceFixture();
    const key = clip.sequence.skin['body-slot'].body[0];
    function picture() {
        const model = parse(file);
        const body = model.skins.get('skin')!.regions.get('body-slot')!.get('body')!;
        return bone2dPicture(body, sampleBone2dProject(model, 'attack', 0.875));
    }
    Object.assign(key, { delay: 0, index: 1, mode: 'loop' });
    expect(picture()).toBe('body008');
    Object.assign(attachment.sequence, { count: 1, setupIndex: 0 });
    Object.assign(key, { delay: 0.125, mode: 'pingpongReverse' });
    expect(picture()).toBe('body007');
    file.project.images = file.project.images.filter((i: { name: string }) => i.name !== 'body007');
    expect(picture).toThrow(/unknown sequence image: body007/);
    delete attachment.sequence;
    expect(picture).toThrow(/unknown sequenced attachment/);
});

test('queries non-rendering markers and deformed polygons in player-root coordinates', () => {
    const file = fixture(),
        rig = file.project.skeleton;
    const body = rig.skins[0].attachments['body-slot'];
    body.body = { type: 'point', x: 3, y: 4, rotation: 45 };
    body.hit = {
        type: 'boundingbox',
        vertices: [],
        weights: [[['root', 0, 0, 1]], [['root', 8, 0, 1]], [['root', 0, 8, 1]]],
    };
    body.path = { type: 'path', vertices: [0, 0, 1, 0, 2, 3, 4, 3, 5, 0, 6, 0], closed: false, constantSpeed: true };
    rig.animations[1].deform.skin = { 'body-slot': { hit: [{ time: 0.5, value: [0, 0, 0, 6, 0, 0] }] } };
    const model = parse(file),
        sample = sampleBone2dProject(model, 'attack', 0.5);
    const world = bone2dWorldMatrices(model, sample);
    function query(key: string) {
        const a = model.skins.get('skin')!.regions.get('body-slot')!.get(key)!;
        if (a.kind === 'mesh' || a.kind === 'region' || a.kind === 'clipping')
            throw new Error('expected a non-rendering shape');
        return bone2dShapeGeometry(a, 'root', sample, world);
    }
    const point = query('body');
    expect(point).toMatchObject({ kind: 'point', x: 4.5, y: 4 });
    if (point.kind !== 'point') throw new Error('expected a point');
    expect(point.rotation).toBeCloseTo(33.69006752598);
    expect(query('hit')).toEqual({ kind: 'boundingbox', vertices: [0, 0, 12, 6, 0, 8] });
    expect(query('path')).toEqual({
        kind: 'path',
        vertices: [0, 0, 1.5, 0, 3, 3, 6, 3, 7.5, 0, 9, 0],
        closed: false,
        constantSpeed: true,
    });
    body.path.vertices.pop();
    expect(() => parse(file)).toThrow(/shape needs at least three XY pairs/);
});

test('convex clipping removes concave dents and duplicate vertices', () => {
    expect(convexClipOutline([-3, -4, 8, -4, 8, 5, 0, 0, -3, 5, -3, -4])).toEqual([-3, -4, 8, -4, 8, 5, -3, 5]);
});

test('preserves all four slots blend modes and rejects unknown values', () => {
    for (const blend of ['normal', 'additive', 'multiply', 'screen']) {
        const file = fixture();
        file.project.skeleton.slots[0].blend = blend;
        expect(parse(file).slots[0].blend).toBe(blend);
    }
    const invalid = fixture();
    invalid.project.skeleton.slots[0].blend = 'overlay';
    expect(() => parse(invalid)).toThrow(/invalid slot blend/);
});

test('two-color keys override light after their first key and animate only explicitly enabled dark tint', () => {
    const file = fixture(),
        rig = file.project.skeleton;
    rig.slots[0].dark = [0.125, 0.25, 0.5];
    const track = {
        rgba: [{ time: 0, value: [0.25, 0.25, 0.25, 0.25] }],
        rgba2: [
            { time: 0.25, value: [1, 0.5, 0.75, 1, 0, 0.5, 1] },
            { time: 0.75, value: [0.5, 0.5, 0.25, 0.5, 0.5, 0.5, 0] },
        ],
    };
    const clip = rig.animations[1];
    clip.slots['body-slot'] = clip.slots['arm-slot'] = track;
    const model = parse(file);
    expect(sampleBone2dProject(model, 'attack', 0).slots.get('body-slot')).toMatchObject({
        color: [0.25, 0.25, 0.25, 0.25],
        dark: [0.125, 0.25, 0.5],
    });
    const midpoint = sampleBone2dProject(model, 'attack', 0.5);
    expect(midpoint.slots.get('body-slot')).toMatchObject({ color: [0.75, 0.5, 0.5, 0.75], dark: [0.25, 0.5, 0.5] });
    expect(midpoint.slots.get('arm-slot')).toMatchObject({ color: [0.75, 0.5, 0.5, 0.75], dark: null });
});

const inheritOracle = [
    ['normal', [-2.025449, 0.041812, 0.4228, 1.279957]],
    ['onlyTranslation', [0.771345, -0.338095, 0.919253, 0.725046]],
    ['noRotationOrReflection', [1.645296, -0.47695, 1.660788, 1.105]],
    ['noScale', [-1.172973, -0.177467, 0.253246, 0.780068]],
    ['noScaleOrReflection', [-1.18885, -0.236343, -0.163207, -0.764292]],
] as const;

test.each(inheritOracle)('mirrored parent and animated shear: %s', (inherit, expected) => {
    const file = fixture(),
        rig = file.project.skeleton;
    const root = rig.bones.find((b: { id: string }) => b.id === 'root'),
        child = rig.bones[0];
    Object.assign(root, { x: 10, y: 20, rotation: 30, scaleX: -2, scaleY: 1.5 });
    Object.assign(child, { x: 3, y: 4, rotation: 40, scaleX: 1.2, scaleY: 0.8, shearX: 4, shearY: -12, inherit });
    rig.animations[1].bones['arm-bone'] = {
        shear: [{ time: 0.5, value: [24, -3] }],
        shearx: [{ time: 0.5, value: [6] }],
    };
    function matrix() {
        const model = parse(file),
            sample = sampleBone2dProject(model, 'attack', 0.5);
        expect(model.affineSprites).toBe(true);
        expect(sample.shears.get('arm-bone')).toEqual([10, -15]);
        return bone2dWorldMatrices(model, sample).get('arm-bone')!;
    }
    const m = matrix();
    [...expected, 1.803847, 22.196152].forEach((v, i) => expect(m[i]).toBeCloseTo(v, 5));
    Object.assign(root, { scaleX: 0, scaleY: 0 });
    const collapsed = matrix();
    expect(collapsed.slice(4)).toEqual([10, 20]);
    expect(collapsed.slice(0, 4).every(Number.isFinite)).toBe(true);
    if (inherit !== 'onlyTranslation') expect(Math.hypot(...collapsed.slice(0, 4))).toBe(0);
});
test('signed two-node affine factorization reconstructs deterministic matrices including collapsed axes', () => {
    let rng = 0x4206970;
    const next = () => ((rng = (Math.imul(1664525, rng) + 1013904223) >>> 0) / 4294967296 - 0.5) * 12;
    for (let i = 0; i < 512; ++i) {
        const a = next(),
            b = next(),
            c = i % 16 === 0 ? a : next(),
            d = i % 16 === 0 ? b : next();
        const [outer, inner, x, y] = factorBone2dBasis([a, b, c, d, 0, 0]);
        const m = multiplyBasis(poseBasis(outer, x, y, [0, 0]), poseBasis(inner, 1, 1, [0, 0]));
        [a, b, c, d].forEach((value, k) => expect(m[k]).toBeCloseTo(value, 11));
    }
    const [o, i, sx, sy] = factorBone2dBasis([0, 0, 0, 0, 0, 0]);
    expect([o, i, sx, sy]).toEqual([0, 0, 0, 0]);
});

test('skin membership activates required ancestors without activating the default fallback skin', () => {
    const file = fixture(),
        rig = file.project.skeleton;
    const arm = rig.bones.find((bone: { id: string }) => bone.id === 'arm-bone');
    arm.skinRequired = true;
    rig.bones.push({ ...arm, id: 'arm-grip', parent: 'arm-bone' });
    rig.skins[0].bones = ['arm-bone'];
    rig.skins.push({ id: 'armor', name: 'Armor', bones: ['arm-grip'], constraints: [], attachments: {} });
    const model = parse(file);
    for (const overlays of [[], ['skin']]) {
        const off = sampleBone2dProject(model, 'attack', 0.5, overlays);
        expect(off.activeBones.has('arm-bone')).toBe(false);
        expect(off.slots.get('arm-slot')?.attachment).toBeNull();
        expect(off.bones.get('arm-bone')?.[0]).toBe(6);
    }
    const on = sampleBone2dProject(model, 'attack', 0.5, ['armor']);
    expect(on.activeBones.has('arm-grip')).toBe(true);
    expect(on.activeBones.has('arm-bone')).toBe(true);
    expect(on.slots.get('arm-slot')?.attachment).toBe('arm');
    expect(on.bones.get('arm-bone')?.[0]).toBe(26);
    expect(() => sampleBone2dProject(model, 'attack', 0.5, ['missing'])).toThrow(/unknown skin/);
    rig.skins[1].bones = ['missing'];
    expect(() => parse(file)).toThrow(/invalid skin bones/);
});

const ikFixtureText = readFileSync(resolve(__dirname, '../fixtures/bone2d/ordered-ik.bone2d'), 'utf8');
const ikFixture = (): any => JSON.parse(ikFixtureText);
const ikWorld = (file: unknown, skins: readonly string[] = ['engaged'], time = 0) => {
    const model = parse(file);
    return bone2dWorldMatrices(model, sampleBone2dProject(model, 'idle', time, skins));
};

test('IK reads the latest target matrix in authored order; a skin sample cannot reuse a previous pose', () => {
    const file = ikFixture();
    const aim = (world: ReturnType<typeof ikWorld>) => {
        const [a, , c] = world.get('arm-bone')!;
        return (Math.atan2(c, a) * 180) / Math.PI;
    };
    const off = ikWorld(file, ['skin']);
    expect(aim(off)).toBeCloseTo(36.86989765, 7);
    expect(off.get('tip')!.slice(4)).toEqual([4, 0]);
    const on = ikWorld(file);
    expect(aim(on)).toBeCloseTo(90, 7);
    expect(on.get('tip')![4]).toBeCloseTo(0, 7);
    expect(on.get('tip')![5]).toBeCloseTo(4, 7);
    expect(ikWorld(file, [])).toEqual(off);
    file.project.skeleton.constraints.reverse();
    const reverse = ikWorld(file);
    expect(reverse.get('tip')).toEqual(on.get('tip'));
    expect(aim(reverse)).toBeCloseTo(36.86989765, 7);
});

test('IK interpolates mix, steps per-key flags and evaluates scaleY modes at the sample time', () => {
    for (const scaleY of ['none', 'uniform', 'volume']) {
        const file = ikFixture();
        const rig = file.project.skeleton;
        rig.constraints[0].scaleY = scaleY;
        const key = (time: number, mix: number, stretch: boolean, compress = false) => ({
            time,
            value: [mix, 0],
            stretch,
            compress,
            bendPositive: true,
        });
        rig.animations[0].ik = { first: [key(0.25, 0, true), key(0.75, 1, false)] };
        const [a, b, c, d] = ikWorld(file, ['engaged'], 0.5).get('driver')!;
        expect(Math.atan2(c, a)).toBeCloseTo(Math.PI / 4, 7);
        expect(Math.hypot(a, c)).toBeCloseTo(1.75, 7);
        expect(Math.hypot(b, d)).toBeCloseTo(scaleY === 'none' ? 1 : scaleY === 'uniform' ? 1.75 : 1 / 1.75, 7);
        expect(Math.hypot(...ikWorld(file, ['engaged'], 0.75).get('tip')!.slice(4))).toBeCloseTo(4, 7);
        expect(ikWorld(file, ['engaged'], 0.125).get('tip')![5]).toBeCloseTo(4, 7);
        rig.bones[3].y = 1;
        rig.animations[0].ik = { first: [key(0, 1, false, true)] };
        const [aa, bb, cc, dd] = ikWorld(file).get('driver')!;
        expect(Math.hypot(aa, cc)).toBeCloseTo(0.25, 7);
        expect(Math.hypot(bb, dd)).toBeCloseTo(scaleY === 'none' ? 1 : scaleY === 'uniform' ? 0.25 : 1 / 0.41071425, 7);
    }
});

test('IK skin membership does not activate a skin-required target bone by itself', () => {
    const file = ikFixture();
    const rig = file.project.skeleton;
    rig.bones[3].skinRequired = true;
    rig.skins.push({ id: 'target-skin', name: 'Target', bones: ['target'], constraints: [], attachments: {} });
    expect(ikWorld(file).get('tip')!.slice(4)).toEqual([4, 0]);
    expect(ikWorld(file, ['target-skin']).get('tip')!.slice(4)).toEqual([4, 0]);
    expect(ikWorld(file, ['engaged', 'target-skin']).get('tip')![5]).toBeCloseTo(4, 7);
});

test('an IK target below a skin-required bone is disabled until that target or its descendant is listed', () => {
    const file = ikFixture();
    const rig = file.project.skeleton;
    rig.bones[1].skinRequired = true;
    rig.skins[1].bones = ['driver'];
    rig.skins.push({ id: 'tip-skin', name: 'Tip', bones: ['tip'], constraints: [], attachments: {} });
    const driverOnly = ikWorld(file);
    expect(driverOnly.get('tip')).toEqual([1, 0, 0, 1, 0, 0]);
    expect(driverOnly.get('arm-bone')![2]).toBeCloseTo(0, 7);
    const both = ikWorld(file, ['engaged', 'tip-skin']);
    expect(both.get('tip')![5]).toBeCloseTo(4, 7);
    expect(both.get('arm-bone')![2]).toBeCloseTo(1, 7);
});

test('rejects unknown IK references and non-contiguous two-bone chains', () => {
    const file = ikFixture();
    file.project.skeleton.constraints[0].target = 'missing';
    expect(() => parse(file)).toThrow(/FORMAT.*unknown IK/);
    file.project.skeleton.constraints[0].target = 'target';
    file.project.skeleton.constraints[0].bones.push('arm-bone');
    expect(() => parse(file)).toThrow(/FORMAT.*direct child/);
});

const twoBoneIkText = readFileSync(resolve(__dirname, '../fixtures/bone2d/two-bone-ik.bone2d'), 'utf8');
const twoBoneFixture = (): any => JSON.parse(twoBoneIkText);
function anglesForPair(world: ReturnType<typeof ikWorld>): [number, number] {
    const [a, b, c, d] = world.get('driver')!;
    const [e, , g] = world.get('elbow')!;
    return [(Math.atan2(c, a) * 180) / Math.PI, (Math.atan2(a * g - c * e, d * e - b * g) * 180) / Math.PI];
}
const xyzClose = (actual: readonly number[], expected: readonly number[], precision = 5): void => {
    expect(actual).toHaveLength(expected.length);
    expect(actual.every(Number.isFinite)).toBe(true);
    actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], precision));
};
test('two-bone reachable stretch changes the elbow without stretching or moving the tip', () => {
    const file = twoBoneFixture();
    const rest = ikWorld(file, []);
    xyzClose(anglesForPair(rest), [-36.869897, 90]);
    xyzClose(rest.get('elbow')!.slice(4), [2.2, -0.4]);
    xyzClose(rest.get('tip')!.slice(4), [4, 2]);
    file.project.skeleton.constraints[0].stretch = true;
    const stretch = ikWorld(file, []);
    xyzClose(anglesForPair(stretch), [-6.450208, 54.314664]);
    xyzClose(stretch.get('tip')!.slice(4), [4, 2]);
    xyzClose([Math.hypot(stretch.get('driver')![0], stretch.get('driver')![2])], [1]);
    expect(stretch.get('elbow')!.slice(4)).not.toEqual(rest.get('elbow')!.slice(4));
});

test('the anisotropic IK ellipse gives two distinct joint poses to the same reachable point', () => {
    const file = twoBoneFixture();
    const rig = file.project.skeleton;
    rig.bones[1].scaleX = 2;
    Object.assign(rig.bones[4], { x: 5, y: 3 });
    let world = ikWorld(file, []);
    xyzClose(anglesForPair(world), [0.505274, 80.1515]);
    xyzClose(world.get('tip')!.slice(4), [5, 3]);
    rig.constraints[0].bendPositive = false;
    world = ikWorld(file, []);
    xyzClose(anglesForPair(world), [61.422238, -80.1515], 4);
    xyzClose(world.get('tip')!.slice(4), [5, 3]);
    rig.constraints[0].bendPositive = true;
    rig.constraints[0].mix = 0.25;
    world = ikWorld(file, []);
    xyzClose(world.get('tip')!.slice(4), [9.634508, 1.049167]);
    xyzClose(anglesForPair(world), [0.126319, 20.037875]);
});

test('two-bone IK keys interpolate softness, step bend, and do not solve non-normal inheritance', () => {
    const file = twoBoneFixture();
    const rig = file.project.skeleton;
    Object.assign(rig.bones[4], { x: 5.4, y: 0 });
    const key = (time: number, soft: number, bendPositive: boolean) => ({
        time,
        value: [1, soft],
        stretch: false,
        compress: false,
        bendPositive,
    });
    rig.animations[0].ik = { first: [key(0, 0, true), key(1, 1, false)] };
    xyzClose(ikWorld(file, [], 0).get('tip')!.slice(4), [5.236068, 0]);
    const middle = ikWorld(file, [], 0.5);
    expect(middle.get('tip')![4]).toBeLessThan(5.236068);
    expect(anglesForPair(middle)[1]).toBeGreaterThan(0);
    const last = ikWorld(file, [], 1);
    xyzClose(last.get('tip')!.slice(4), [5.061316, 0]);
    expect(anglesForPair(last)[1]).toBeLessThan(0);
    rig.bones[2].inherit = 'onlyTranslation';
    const unsolved = ikWorld(file, [], 1);
    xyzClose(unsolved.get('tip')!.slice(4), [5, 1]);
});

test('two-bone fallback stays finite for a collapsed elbow, distal length or grandparent basis', () => {
    const file = twoBoneFixture();
    const rig = file.project.skeleton;
    const assertFinite = () => {
        for (const matrix of ikWorld(file, []).values()) expect(matrix.every(Number.isFinite)).toBe(true);
    };
    Object.assign(rig.bones[2], { x: 0, y: 0 });
    assertFinite();
    Object.assign(rig.bones[2], { x: 2, y: 0, length: 0 });
    Object.assign(rig.bones[4], { x: 2, y: 0 });
    assertFinite();
    rig.bones[0].scaleX = 0;
    assertFinite();
});

test('mixed one- and two-bone constraints respect authored order and keep inactive child slots hidden', () => {
    const file = twoBoneFixture();
    const rig = file.project.skeleton;
    rig.bones.push({ ...rig.bones[1], id: 'follower', x: 0, y: -3 });
    rig.constraints.push({ ...rig.constraints[0], id: 'follow', bones: ['follower'], target: 'tip' });
    const read = () => {
        const matrices = ikWorld(file, []);
        const [a, , c] = matrices.get('follower')!;
        return [Math.atan2(c, a), ...matrices.get('tip')!.slice(4)];
    };
    xyzClose(read(), [Math.atan2(5, 4), 4, 2]);
    rig.constraints.reverse();
    xyzClose(read(), [Math.atan2(4, 5), 4, 2]);
    rig.bones[2].skinRequired = true;
    const parsed = parse(file);
    const sample = sampleBone2dProject(parsed, 'idle', 0.25);
    expect(sample.slots.get('elbow-slot')!.attachment).toBeNull();
    expect(sample.slots.get('tip-slot')!.attachment).toBeNull();
    xyzClose(anglesForPair(bone2dWorldMatrices(parsed, sample)).slice(0, 1), [-36.869897]);
});
