import { TiledMap } from '../../src/cocos/tiledmap/tiled-map';
import { GID, TiledAnimation, TiledGrid } from '../../src/cocos/tiledmap/tiled-types';
import { TMXMapInfo } from '../../src/cocos/tiledmap/tmx-xml-parser';

function createClip(durations: number[], missingGrid = false) {
    const map = new TiledMap();
    const base = 1 as GID;
    const frames = durations.map((duration, index) => ({ duration, tileid: (index + 2) as GID, grid: null }));
    const animation: TiledAnimation = { frames, dt: 0, frameIdx: 0 };
    const staticGrid = {} as TiledGrid;
    map._texGrids.set(base, staticGrid);
    for (const frame of missingGrid ? frames.slice(0, -1) : frames) map._texGrids.set(frame.tileid, {} as TiledGrid);
    map._animations.set(base, animation);
    map._fillAniGrids(map._texGrids, map._animations);
    return {
        animation,
        map,
        get matchesFrame() {
            return map._texGrids.get(base) === animation.frames[animation.frameIdx]?.grid;
        },
        get hasStaticFallback() {
            return !map._animations.has(base) && map._texGrids.get(base) === staticGrid;
        },
    };
}

describe('Native Tiled animation clock', () => {
    test.each([
        [0, 0],
        [0.12499, 0],
        [0.125, 1],
        [0.375, 2],
        [0.5, 2],
        [0.75, 0],
        [75000.5, 2],
    ])('elapsed %s seconds renders frame %i', (dt, expectedIndex) => {
        const clip = createClip([0.125, 0.25, 0.375]);
        clip.map.lateUpdate(dt);
        expect(clip.animation.frameIdx).toBe(expectedIndex);
        expect(clip.matchesFrame).toBe(true);
    });

    test('retains the remainder across hitches and split ticks', () => {
        const once = createClip([0.125, 0.25, 0.375]);
        const split = createClip([0.125, 0.25, 0.375]);
        once.map.lateUpdate(0.5);
        for (const dt of [0.125, 0.125, 0.25]) split.map.lateUpdate(dt);
        expect(once.animation.dt).toBe(0.5);
        expect(split.animation.dt).toBe(once.animation.dt);
        expect(split.animation.frameIdx).toBe(once.animation.frameIdx);
        for (const clip of [once, split]) {
            clip.map.lateUpdate(0.25);
            expect(clip.animation.dt).toBe(0);
            expect(clip.animation.frameIdx).toBe(0);
        }
    });

    test('decimal seconds at frame and cycle boundaries do not strand the previous frame', () => {
        const clip = createClip([0.1, 0.2, 0.1]);
        clip.map.lateUpdate(0.3);
        expect(clip.animation.frameIdx).toBe(2);
        clip.map.lateUpdate(0.1);
        expect(clip.animation.frameIdx).toBe(0);
        expect(clip.animation.dt).toBe(0);
        for (const dt of [-1, NaN, Infinity, -Infinity]) clip.map.lateUpdate(dt);
        expect(clip.animation.dt).toBe(0);
    });

    test.each([[], [0], [-1], [Infinity], [NaN], [0.25, 0, 0.5]].map((clip) => [clip] as const))(
        'keeps the static tile when duration data is unusable: %j',
        (durations) => {
            const clip = createClip(durations);
            clip.map.lateUpdate(42);
            expect(clip.hasStaticFallback).toBe(true);
        },
    );

    test('keeps the static tile when an animation refers to a missing grid', () => {
        const clip = createClip([0.1, 0.1], true);
        clip.map.lateUpdate(1);
        expect(clip.hasStaticFallback).toBe(true);
    });

    test.each([
        '',
        '<frame tileid="0"/>',
        '<frame tileid="0" duration="0"/>',
        '<frame tileid="0" duration="-10"/>',
        '<frame tileid="0" duration="Infinity"/>',
        '<frame tileid="0" duration="125"/><frame tileid="0" duration="oops"/>',
    ])('does not register a malformed TMX animation: %s', (frames) => {
        const xml = `<map orientation="orthogonal" width="1" height="1" tilewidth="16" tileheight="16">
          <tileset firstgid="1" name="tiles" columns="1" tilecount="1" tilewidth="16" tileheight="16">
            <image source="tiles.png" width="16" height="16"/>
            <tile id="0"><animation>${frames}</animation></tile>
          </tileset>
        </map>`;
        expect(new TMXMapInfo(xml, {}, {}, {}, {}).getTileAnimations().size).toBe(0);
    });
});
