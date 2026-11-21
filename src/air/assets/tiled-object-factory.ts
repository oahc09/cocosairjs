/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/

import { UITransform } from '../../cocos/2d/framework/ui-transform';
import { isValid } from '../../cocos/core/data/object';
import { Node } from '../../cocos/scene-graph/node';
import type { TiledMap } from '../../cocos/tiledmap/tiled-map';
import type { TiledObjectGroup, TMXRawObject } from '../../cocos/tiledmap/tiled-object-group';
import { TMXObjectType } from '../../cocos/tiledmap/tiled-types';
import type { PropertiesInfo } from '../../cocos/tiledmap/tiled-types';

export interface TiledObjectFactoryContext {
    readonly source: TMXRawObject;
    readonly properties: Readonly<PropertiesInfo>;
    readonly group: TiledObjectGroup;
}

export type TiledObjectFactory = (context: TiledObjectFactoryContext) => Node | undefined;

export interface TiledObjectFactoryHandle {
    /** Created roots in native group/object order. */
    readonly nodes: readonly Node[];
    readonly disposed: boolean;
    dispose(): void;
}

const activeMaps = new WeakSet<TiledMap>();

/**
 * Instantiate visible shape markers with an exact, application-registered Tiled class.
 * Native image and text objects remain entirely owned by TiledMap.
 */
export function instantiateTiledObjects(
    map: TiledMap,
    factories: ReadonlyMap<string, TiledObjectFactory>,
): TiledObjectFactoryHandle {
    const asset = map.tmxAsset;
    if (!isValid(map, true) || !asset) throw new Error('Attach a TiledMapAsset first');
    if (activeMaps.has(map)) throw new Error('Dispose the existing Tiled object factory handle first');
    const registered = new Map(factories);
    const nodes: Node[] = [];
    let disposed = false;
    activeMaps.add(map);
    const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        try {
            for (let index = nodes.length - 1; index >= 0; --index) {
                const node = nodes[index];
                if (isValid(node, true)) {
                    node.removeFromParent();
                    node.destroy();
                }
            }
        } finally {
            activeMaps.delete(map);
        }
    };
    try {
        for (const group of map.getObjectGroups().slice()) {
            const objects = group.getObjects();
            const sources = group.getRawObjects();
            const transform = group.node.getComponent(UITransform)!;
            for (const [index, source] of sources.entries()) {
                if (!source.visible || !source.className
                    || source.type === TMXObjectType.IMAGE || source.type === TMXObjectType.TEXT) continue;
                const factory = registered.get(source.className);
                if (!factory) continue;
                const object = objects[index];
                if (!object || object.id !== source.id) throw new Error('Tiled object list changed since parsing');
                const x = object.x - transform.width * transform.anchorX;
                const y = object.y - transform.height * (1 - transform.anchorY);
                const node = factory({ source, properties: Object.freeze({ ...object.properties }), group });
                if (node === undefined) continue;
                let ancestor: Node | null = group.node;
                while (ancestor && ancestor !== node) ancestor = ancestor.parent;
                if (!(node instanceof Node) || !isValid(node, true) || node.parent || ancestor) {
                    throw new Error('Tiled object factory must return a fresh detached Node');
                }
                nodes.push(node);
                if (!isValid(map, true) || map.tmxAsset !== asset
                    || group.node.parent !== map.node || group.getRawObjects() !== sources) {
                    throw new Error('TiledMap changed during object instantiation');
                }
                // Match native text/image placement; the parent already accounts for map anchor and group offset.
                node.layer = group.node.layer;
                node.setPosition(x, y, 0);
                node.setRotationFromEuler(0, 0, -source.rotation);
                group.node.addChild(node);
            }
        }
        return { nodes: Object.freeze(nodes), get disposed() { return disposed; }, dispose };
    } catch (error) {
        dispose();
        throw error;
    }
}
