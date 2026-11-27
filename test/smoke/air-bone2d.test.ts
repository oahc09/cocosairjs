import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseBone2dProject, sampleBone2dProject } from '../../src/air/bone2d/project';

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
        'mesh',
        (d) => {
            d.project.skeleton.skins[0].attachments['body-slot'].body.type = 'mesh';
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
