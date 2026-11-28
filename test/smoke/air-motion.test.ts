import { createAirMotionTimeline, type AirMotionChannel } from '../../src/air/motion/timeline';
import { createAirMotionStagger } from '../../src/air/motion/stagger';
import { bindAirMotionNode, bindAirMotionOpacity } from '../../src/air/motion/targets';
import { Node } from '../../src/cocos/scene-graph/node';
import { UIOpacity } from '../../src/cocos/2d/components/ui-opacity';

function channel(initial = 0) {
    let value = initial;
    const write = jest.fn((next: number) => {
        value = next;
    });
    return { read: () => value, write } satisfies AirMotionChannel;
}

test('local labels and end-relative offsets flatten; the last start owns the property through gaps', () => {
    const x = channel(2);
    const timeline = createAirMotionTimeline(
        [
            { channel: 'x', to: 10, duration: 4 },
            {
                group: [
                    { label: 'enter', at: 0 },
                    { channel: 'x', to: 8, duration: 1, at: { label: 'enter', offset: 0.5 } },
                    { channel: 'x', to: 9, duration: 0, at: { afterEnd: 0.5 } },
                ],
                at: { afterEnd: -3 },
            },
        ],
        { x },
    );
    expect(timeline.duration).toBe(4);
    for (const [t, expected] of [
        [0, 2],
        [1.5, 5],
        [2, 6.5],
        [2.75, 8],
        [3, 9],
        [4, 9],
        [2, 6.5],
        [1.5, 5],
    ]) {
        timeline.seek(t);
        expect(x.read()).toBe(expected);
    }
});

test('at equal starts, later declaration replaces earlier; zero duration is a step', () => {
    const x = channel(3);
    const timeline = createAirMotionTimeline(
        [
            { channel: 'x', to: 8, duration: 2, at: 1 },
            { channel: 'x', to: 12, duration: 0, at: 1 },
        ],
        { x },
    );
    timeline.seek(0.999);
    expect(x.read()).toBe(3);
    timeline.seek(1);
    expect(x.read()).toBe(12);
    timeline.seek(2);
    expect(x.read()).toBe(12);
});

test('seek never fires finish; explicit play, pause, revert, destruction and reduced motion', () => {
    const value = channel(5);
    const onFinish = jest.fn();
    const entries = [{ channel: 'value', to: 10, duration: 1 }];
    const timeline = createAirMotionTimeline(entries, { value }, { onFinish });
    timeline.seek(8);
    expect(value.read()).toBe(10);
    expect(onFinish).not.toHaveBeenCalled();
    timeline.play();
    timeline.advance(0.2);
    expect(value.read()).toBe(6);
    timeline.pause();
    timeline.advance(0.2);
    expect(timeline.time).toBe(0.2);
    timeline.play();
    timeline.advance(1);
    expect(onFinish).toHaveBeenCalledTimes(1);
    timeline.revert();
    expect(value.read()).toBe(5);
    const reduced = createAirMotionTimeline(entries, { value }, { reducedMotion: true, onFinish });
    reduced.play();
    expect(value.read()).toBe(10);
    expect(reduced.playing).toBe(false);
    expect(onFinish).toHaveBeenCalledTimes(2);
    reduced.dispose();
    const count = value.write.mock.calls.length;
    reduced.seek(0);
    reduced.play();
    reduced.revert();
    reduced.advance(1);
    expect(value.write).toHaveBeenCalledTimes(count);
    expect(onFinish).toHaveBeenCalledTimes(2);
});

test('retargeting samples the current spring pose, with no initial jump', () => {
    const x = channel(0.75);
    const entries = [{ channel: 'x', to: 0, duration: 1, ease: 'spring' as const }];
    const first = createAirMotionTimeline(entries, { x });
    first.play();
    first.advance(0.15);
    const interrupted = x.read();
    const second = createAirMotionTimeline(entries, { x });
    first.dispose();
    second.play();
    expect(x.read()).toBe(interrupted);
    second.advance(1);
    expect(x.read()).toBe(0);
});

test('strict input boundary: no paths or inherited channels; malformed groups, numbers and labels fail early', () => {
    const x = channel();
    const entry = { channel: 'x', to: 1, duration: 1 };
    for (const invalid of [
        [{ ...entry, channel: 'node.__proto__.position' }],
        [{ ...entry, duration: Infinity }],
        [{ ...entry, at: -1 }],
        [{ ...entry, at: { label: 'missing' } }],
        [{ label: 'a' }, { label: 'a' }],
        [{ ...entry, to: NaN }],
        [null],
    ])
        expect(() => createAirMotionTimeline(invalid as any, { x })).toThrow();
    expect(() => createAirMotionTimeline([entry], Object.create({ x }))).toThrow('Unknown motion channel');
    const circular: any[] = [];
    circular.push({ group: circular });
    expect(() => createAirMotionTimeline(circular, { x })).toThrow('Invalid motion group');
    expect(x.write).not.toHaveBeenCalled();
});

test('real Node and UIOpacity setters, including destroyed targets', () => {
    const node = new Node();
    node.setPosition(2, 3, 4);
    const opacity = node.addComponent(UIOpacity);
    const x = bindAirMotionNode(node, 'position.x');
    const alpha = bindAirMotionOpacity(opacity);
    const timeline = createAirMotionTimeline(
        [
            { channel: 'x', to: 4, duration: 1, at: 0 },
            { channel: 'alpha', to: 35, duration: 1, at: 0 },
        ],
        { x, alpha },
    );
    timeline.seek(0.5);
    expect([node.position.x, node.position.y, node.position.z, opacity.opacity]).toEqual([3, 3, 4, 145]);
    node.destroy();
    timeline.seek(1);
    expect(node.position.x).toBe(3);
    expect(opacity.opacity).toBe(145);
});

test('2D and 3D stagger are stable and random ranks are seeded permutations', () => {
    expect(createAirMotionStagger({ columns: 2, rows: 2, from: 'center', step: 1 })).toEqual([0, 0, 0, 0]);
    expect(createAirMotionStagger({ columns: 1, rows: 1, layers: 3, from: 'end', step: 0.5 })).toEqual([1, 0.5, 0]);
    const opts = { columns: 3, rows: 2, layers: 2, step: 1, from: 'random' as const };
    const seeded = createAirMotionStagger({ ...opts, seed: 42 });
    expect([...seeded].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i));
    expect(createAirMotionStagger({ ...opts, seed: 42 })).toEqual(seeded);
    expect(createAirMotionStagger({ ...opts, seed: 43 })).not.toEqual(seeded);
    expect(() => createAirMotionStagger({ columns: 0, rows: 4, step: 1 })).toThrow();
    expect(() => createAirMotionStagger({ columns: 3, rows: 4, step: Infinity })).toThrow();
});
