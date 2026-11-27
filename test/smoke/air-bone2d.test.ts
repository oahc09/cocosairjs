import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
    parseBone2dProject,
    sampleBone2dProject,
    bone2dWorldMatrices,
    bone2dMeshPositions,
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
        'unsupported clipping shape',
        (d) => {
            d.project.skeleton.skins[0].attachments['body-slot'].body.type = 'clipping';
        },
        /UNSUPPORTED/,
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
