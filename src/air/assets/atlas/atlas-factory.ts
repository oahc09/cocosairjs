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
/**
 * Cocos Air — libGDX 图集原生 SpriteFrame 工厂与持有句柄（PG-01）。
 *
 * 由解析文档（atlas-parser.ts）+ 每页 Texture2D 组装原生 SpriteFrame：
 *  - rect 保留**逻辑**（未旋转裁剪后）尺寸；rotated 交给原生 `_calculateUV` 的交换语义
 *    （UV 右/下边界用 rect.x+rect.height / rect.y+rect.width，即页上占用 = 交换宽高）；
 *  - rect.y = region.xy.y（GPU 实证：DOM 上传 UNPACK_FLIP_Y=false + 原生 UV 将 rect.y/texh
 *    分配给四边形顶边，v=0 即 PNG 视觉顶行；页坐标按顶原点直取即朝上正确。Lead 三浏览器
 *    像素采集确认，原“页底原点换算”已纠正）；
 *  - originalSize/offset：Cocos offset 是"原中心 → 裁剪中心"的距离，正 Y 向上；
 *    libGDX offset 是自原图左/下边的修剪距离，按 Lead 公式换算：
 *    offsetX = left + logicalW/2 − originalW/2；offsetY = bottom + logicalH/2 − originalH/2；
 *  - 不做逐 region 烘焙 canvas；每帧原生引用每页 Texture2D。
 *
 * 所有权：handle 对每页纹理持一份 addRef、对每个工厂产出的 SpriteFrame 持一份 addRef；
 * 消费者（如 Sprite 组件）自行 addRef；任一帧 refCount > 1 时 dispose 拒绝（AIR_E_ATLAS_IN_USE，
 * 先解绑 Sprite / 归还额外 owner），绝不 force release 外部持有者；dispose 幂等。
 */

import { SpriteFrame } from '../../../cocos/2d/assets/sprite-frame';
import { Texture2D } from '../../../cocos/asset/assets/texture-2d';
import { Rect, Size, Vec2 } from '../../../cocos/core/math';
import type { AirAtlasDocument, AirAtlasRegion } from './atlas-parser';

function fail (code: string, message: string): never {
    const error = new Error(`${code}: ${message}`);
    Object.assign(error, { code });
    throw error;
}

/** @en Build one native SpriteFrame for a region. @zh 为一个区域构建原生 SpriteFrame。 */
export function createAtlasSpriteFrame (document: AirAtlasDocument, pageTextures: readonly Texture2D[], region: AirAtlasRegion): SpriteFrame {
    const page = document.pages[region.pageIndex];
    const texture = pageTextures[region.pageIndex];
    if (!page || !(texture instanceof Texture2D)) {
        fail('AIR_E_ATLAS_PAGE_TEXTURE', `page ${region.pageIndex} texture missing for region "${region.name}"`);
    }
    if (texture.width !== page.width || texture.height !== page.height) {
        fail('AIR_E_ATLAS_PAGE_TEXTURE', `page ${region.pageIndex} texture ${texture.width}x${texture.height} does not match atlas page ${page.width}x${page.height}`);
    }
    const frame = new SpriteFrame();
    frame.texture = texture; // 借用赋值：所有权 addRef 由 handle 统一执行
    frame.rotated = region.rotate === 90;
    // GPU 实证（Lead 三浏览器像素采集）：rect.y 直接取 region.xy.y（顶原点直取），
    // rotated 的交换占用由原生 UV 的 rect.y+rect.width / rect.x+rect.height 消费。
    frame.rect = new Rect(region.xy.x, region.xy.y, region.logical.width, region.logical.height);
    frame.originalSize = new Size(region.original.width, region.original.height);
    frame.offset = new Vec2(
        region.offset.left + region.logical.width / 2 - region.original.width / 2,
        region.offset.bottom + region.logical.height / 2 - region.original.height / 2,
    );
    return frame;
}

/** @en Owned handle over the atlas pages and its SpriteFrames. @zh 图集页纹理与 SpriteFrame 的持有句柄。 */
export interface AirAtlasHandle {
    readonly document: AirAtlasDocument;
    readonly textures: readonly Texture2D[];
    readonly disposed: boolean;
    /** @en Plain (index -1) frame of the name. Indexed frames need an explicit index. @zh 名称的普通帧（index -1）；动画帧必须显式给 index。 */
    getFrame(name: string, index?: number): SpriteFrame | undefined;
    /** @en All frames of the name ordered by index (animation frames queryable, never merged). @zh 名称全部帧（按 index 升序，动画帧可查、绝不合并）。 */
    getFrames(name: string): readonly SpriteFrame[];
    /** @en Idempotent; refuses while any frame has extra owners (AIR_E_ATLAS_IN_USE). @zh 幂等；任一帧仍有额外持有者时拒绝（AIR_E_ATLAS_IN_USE）。 */
    dispose(): void;
}

/** @en Assemble the native frames and own pages/frames. @zh 组装原生帧并接管页纹理/帧引用。 */
export function createAtlasHandle (document: AirAtlasDocument, pageTextures: readonly Texture2D[]): AirAtlasHandle {
    if (pageTextures.length !== document.pages.length) {
        fail('AIR_E_ATLAS_PAGE_TEXTURE', `expected ${document.pages.length} page textures, got ${pageTextures.length}`);
    }
    const frames: SpriteFrame[] = [];
    const byKey = new Map<string, SpriteFrame>();
    const byName = new Map<string, SpriteFrame[]>();
    try {
        for (const region of document.regions) {
            const frame = createAtlasSpriteFrame(document, pageTextures, region);
            frames.push(frame);
            byKey.set(region.index === -1 ? region.name : `${region.name}\u0000${region.index}`, frame);
            const list = byName.get(region.name) ?? [];
            list.push(frame);
            byName.set(region.name, list);
        }
    } catch (error) {
        for (const frame of frames) frame.destroy(); // 失败不产出半成品帧
        throw error;
    }
    for (const texture of pageTextures) texture.addRef(); // handle 对每页纹理持一份
    for (const frame of frames) frame.addRef(); // handle 对每帧持一份（消费者自行 addRef）

    let disposed = false;
    return Object.freeze({
        document,
        textures: Object.freeze([...pageTextures]),
        get disposed () { return disposed; },
        getFrame (name: string, index = -1): SpriteFrame | undefined {
            return byKey.get(index === -1 ? name : `${name}\u0000${index}`);
        },
        getFrames (name: string): readonly SpriteFrame[] {
            return Object.freeze([...(byName.get(name) ?? [])]);
        },
        dispose (): void {
            if (disposed) return;
            for (const frame of frames) {
                if (frame.refCount > 1) {
                    fail('AIR_E_ATLAS_IN_USE', `frame "${frame.name}" still has extra owners; detach sprites / release extra owners before dispose`);
                }
            }
            disposed = true;
            for (const frame of frames) frame.decRef(); // 归零后由 release manager 正常回收
            for (const texture of pageTextures) texture.decRef();
        },
    });
}
