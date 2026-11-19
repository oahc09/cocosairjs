import { Node } from '../../src';
import { TiledMap } from '../../src/cocos/tiledmap/tiled-map';
import { TiledMapAsset } from '../../src/cocos/tiledmap/tiled-map-asset';
import { UITransform } from '../../src/cocos/2d/framework/ui-transform';
import { instantiateTiledObjects, TiledObjectFactory } from '../../src/air/assets/tiled-object-factory';

function fixture(orientation = 'orthogonal') {
    const root = new Node('map');
    const transform = root.addComponent(UITransform);
    const map = root.addComponent(TiledMap);
    const asset = new TiledMapAsset();
    asset.tmxXmlStr = `<map version="1.10" orientation="${orientation}" width="4" height="3" tilewidth="64" tileheight="32">
      <objectgroup name="markers" offsetx="6" offsety="12">
        <object id="1" name="spawn" class="Player" type="LegacyPlayer" x="40" y="20" width="8" height="12" rotation="45">
          <properties><property name="health" type="int" value="3"/></properties>
        </object>
        <object id="2" name="floor" type="Solid" x="64" y="32"><polygon points="0,0 20,0 20,10"/></object>
        <object id="3" name="hidden" class="Player" visible="0" x="0" y="0"/>
        <object id="4" name="unknown" class="Unregistered" x="0" y="0"/>
        <object id="5" name="caption" class="Player" x="12" y="8" width="16" height="10"><text>native</text></object>
      </objectgroup>
    </map>`;
    map.tmxAsset = asset;
    return { root, transform, map, asset };
}

describe('Tiled class object factory', () => {
    test.each([['orthogonal', -88, 28], ['isometric', 4, 26]])(
        '%s reuses native projected position and keeps native nodes', (orientation, x, y) => {
            const { root, transform, map, asset } = fixture(orientation);
            const group = map.getObjectGroup('markers')!;
            const handler: TiledObjectFactory = ({ source, properties, group: owner }) => {
                expect(owner).toBe(group);
                expect(Object.isFrozen(source)).toBe(true);
                if (source.className === 'Player') expect(properties.health).toBe(3);
                return new Node(source.name);
            };
            const h = instantiateTiledObjects(map, new Map([
                ['Player', handler], ['Solid', handler],
                ['LegacyPlayer', () => { throw new Error('legacy must not override class'); }],
            ]));
            expect(h.nodes.map(node => node.name)).toEqual(['spawn', 'floor']);
            expect(h.nodes[0].parent).toBe(group.node);
            expect(h.nodes[0].position).toMatchObject({ x, y });
            expect(h.nodes[0].eulerAngles.z).toBeCloseTo(-45);
            expect(group.node.getChildByName('text5')).not.toBeNull();
            const prior = h.nodes[0].worldPosition.clone();
            transform.setAnchorPoint(0, 1);
            (map as unknown as { _syncAnchorPoint(): void })._syncAnchorPoint();
            expect(h.nodes[0].position).toMatchObject({ x, y });
            expect(h.nodes[0].worldPosition.equals(prior)).toBe(false);
            h.dispose();
            h.dispose();
            expect(h.nodes.every(node => node.parent === null)).toBe(true);
            expect(h.disposed).toBe(true);
            expect(group.node.getChildByName('text5')).not.toBeNull();
            root.destroy(); asset.destroy();
        },
    );

    test('rolls back, rejects reused nodes and keeps map leases independent', () => {
        const first = fixture(), second = fixture();
        const parent = new Node('already owned');
        const attached = new Node('attached');
        parent.addChild(attached);
        const owned = new Node('owned');
        expect(() => instantiateTiledObjects(first.map, new Map([
            ['Player', () => owned], ['Solid', () => attached],
        ]))).toThrow('fresh detached Node');
        expect(owned.parent).toBeNull();
        expect(attached.parent).toBe(parent);
        const factories = new Map([['Player', () => new Node('marker')]]);
        const a = instantiateTiledObjects(first.map, factories);
        const b = instantiateTiledObjects(second.map, factories);
        expect(() => instantiateTiledObjects(first.map, factories)).toThrow('Dispose');
        a.dispose();
        expect(b.nodes[0].parent).toBe(second.map.getObjectGroup('markers')!.node);
        b.dispose();
        first.root.destroy(); first.asset.destroy();
        second.root.destroy(); second.asset.destroy();
        parent.destroy();
    });
});
