import { readFileSync } from 'fs';
import { resolve } from 'path';
import { convexClipOutline } from '../../src/air/bone2d/polygon';
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
            d.project.skeleton.constraints.push({ type: 'ik' });
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
