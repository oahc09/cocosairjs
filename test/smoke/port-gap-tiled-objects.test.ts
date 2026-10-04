import { Node } from '../../src';
import { TMXMapInfo } from '../../src/cocos/tiledmap/tmx-xml-parser';
import { TiledObjectGroup } from '../../src/cocos/tiledmap/tiled-object-group';
import { TMXObjectType } from '../../src/cocos/tiledmap/tiled-types';

function fixture(orientation: string) {
    const xml = `<map version="1.10" orientation="${orientation}" width="4" height="3" tilewidth="64" tileheight="32">
      <objectgroup name="collision">
        <object id="1" name="spawn" class="Player" type="LegacyPlayer" x="40" y="20" width="8" height="12"/>
        <object id="2" name="floor" type="Solid" x="64" y="32"><polygon points="0,0 20,0 20,10"/></object>
        <object id="3" name="path" x="12" y="8"><polyline points="0,0 8,16"/></object>
      </objectgroup>
    </map>`;
    const map = new TMXMapInfo(xml, {}, {}, {}, {});
    const info = map.getObjectGroups()[0];
    const node = new Node('objects');
    const group = node.addComponent(TiledObjectGroup);
    group._init(info, map, new Map());
    return { map, info, node, group };
}

describe('Tiled original geometry and class queries', () => {
    test.each(['orthogonal', 'isometric'])('%s exposes original and native coordinates together', (orientation) => {
        const { node, group } = fixture(orientation);
        const raw = group.getRawObjects();
        expect(raw.find((o) => o.name === 'spawn')).toMatchObject({ x: 40, y: 20, className: 'Player' });
        expect(group.getObject('spawn')).toMatchObject(orientation === 'orthogonal'
            ? { x: 40, y: 76 } : { x: 116, y: 82 });
        expect(group.getObjectsByType('Player').map((o) => o.name)).toEqual(['spawn']);
        expect(group.getObjectsByType('LegacyPlayer')).toEqual([]);
        expect(group.getObjectsByType('Solid').map((o) => o.name)).toEqual(['floor']);
        expect(group.getObjectsByType(TMXObjectType.POLYGON).map((o) => o.name)).toEqual(['floor']);
        expect(raw.find((o) => o.name === 'floor')!.points![2].y).toBe(10);
        expect(group.getObject('floor')!.points![2].y).toBe(-10);
        expect(raw.find((o) => o.name === 'path')!.polylinePoints![1].y).toBe(16);
        expect(Object.isFrozen(raw)).toBe(true);
        expect(Object.isFrozen(raw.find((o) => o.name === 'floor'))).toBe(true);
        expect(Object.isFrozen(raw.find((o) => o.name === 'floor')!.points)).toBe(true);
        expect(Object.isFrozen(raw.find((o) => o.name === 'floor')!.points![2])).toBe(true);
        node.destroy();
    });

    test.each(['orthogonal', 'isometric'])('%s shared parsed objects do not convert cumulatively', (orientation) => {
        const { node, group, map, info } = fixture(orientation);
        const initial = group.getObjects().map((o) => ({ x: o.x, y: o.y }));
        const raw = group.getRawObjects();
        group.getObject('spawn')!.x = 999;
        group.getObject('floor')!.points![2].y = 999;
        expect(raw.find((o) => o.name === 'spawn')!.x).toBe(40);
        expect(raw.find((o) => o.name === 'floor')!.points![2].y).toBe(10);
        group._init(info, map, new Map());
        expect(group.getObjects().map((o) => ({ x: o.x, y: o.y }))).toEqual(initial);
        expect(group.getObject('floor')!.points![2].y).toBe(-10);
        const other = new Node('other');
        const second = other.addComponent(TiledObjectGroup);
        second._init(info, map, new Map());
        expect(second.getObjects().map((o) => ({ x: o.x, y: o.y }))).toEqual(initial);
        expect(second.getRawObjects()[0]).toBe(raw[0]);
        other.destroy(); node.destroy();
    });
});
