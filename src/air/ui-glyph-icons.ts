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
 * Cocos Air — inline sprite placement for `AirGlyphText` (AIR original, no upstream counterpart).
 *
 * The reversed build draws TMP sprite tags (`<sprite name="<n>" tint=1>`) as quads inside the text
 * mesh. That needs the text renderer to mix textures, so instead `AirGlyphText` reserves a rect for
 * every placeholder glyph and this component puts one child `Sprite` in it. Functionally equivalent
 * — same slot order, same tint rule, same reveal coupling — and it inherits the proven sprite path
 * (dynamic atlas, batching, masks) instead of a second custom assembler.
 *
 * Consequences worth knowing:
 * - one child node per icon slot, so a page of inline icons costs that many draw items when they
 *   come from different atlases;
 * - icons follow the text's reveal window for free: a placeholder outside `maxVisibleCharacters`
 *   has no rect, so the child stays inactive until the typewriter reaches it;
 * - `tint=1` multiplies the text colour, `tint=0` draws the frame as authored.
 */
import { ccclass, requireComponent } from 'cc.decorator';
import { Color } from '../cocos/core/math';
import { Component } from '../cocos/scene-graph/component';
import { Node } from '../cocos/scene-graph/node';
import { UITransform } from '../cocos/2d/framework/ui-transform';
import { Sprite } from '../cocos/2d/components/sprite';
import { SpriteFrame } from '../cocos/2d/assets/sprite-frame';
import { AirGlyphText } from './ui-glyph-text';

const UNTINTED = new Color(255, 255, 255, 255);

@ccclass('AirGlyphIconLayer')
@requireComponent(AirGlyphText)
export class AirGlyphIconLayer extends Component {
    /** Extra multiplier on the reserved em box — TMP's sprite scale knob. */
    scale = 1;
    private _frames = new Map<string, SpriteFrame>();
    private _slots = new Map<number, Node>();
    private _warned = new Set<string>();
    private _text: AirGlyphText | null = null;
    private _seen = -1;

    get glyphText (): AirGlyphText {
        if (!this._text) {
            this._text = this.getComponent(AirGlyphText);
            if (!this._text) throw Object.assign(new Error('AIR_E_GLYPH_ICONS: requires an AirGlyphText on the same node'), { code: 'AIR_E_GLYPH_ICONS' });
        }
        return this._text!;
    }

    /** Registers the frame an icon slot looks up by `name`. Passing null removes it. */
    setFrames (name: string, frame: SpriteFrame | null): void {
        if (frame) {
            if (!(frame instanceof SpriteFrame) || !frame.isValid || !frame.texture?.isValid) {
                throw Object.assign(new Error(`AIR_E_GLYPH_ICONS: frame for "${name}" is not a valid SpriteFrame`), { code: 'AIR_E_GLYPH_ICONS' });
            }
            if (this._frames.get(name) === frame) return;
            this._frames.set(name, frame);
            this._warned.delete(name);
            this._seen = -1;
            return;
        }
        if (this._frames.delete(name)) this._seen = -1;
    }

    frameFor (name: string): SpriteFrame | null {
        return this._frames.get(name) ?? null;
    }

    /** Live child sprites this layer owns — node destruction is deferred, so count the registry instead. */
    get slotCount (): number {
        return this._slots.size;
    }

    /** Places a child sprite per icon slot of the current text. Idempotent. */
    sync (): void {
        const text = this.glyphText;
        const live = new Set<number>();
        for (const slot of text.tags.icons) {
            live.add(slot.ordinal);
            const node = this._slotNode(slot.ordinal);
            const rect = text.getCharacterRect(slot.ordinal);
            const frame = this._frames.get(slot.name) ?? null;
            if (!rect || !frame) {
                node.active = false;
                if (!frame) node.getComponent(Sprite)!.spriteFrame = null;
                if (!frame && !this._warned.has(slot.name)) {
                    this._warned.add(slot.name);
                    console.warn(`AIR_E_GLYPH_ICONS: no frame registered for sprite name "${slot.name}"`);
                }
                continue;
            }
            const sprite = node.getComponent(Sprite)!;
            if (sprite.spriteFrame !== frame) sprite.spriteFrame = frame;
            sprite.color = slot.tint ? text.color : UNTINTED;
            const height = rect.height * this.scale;
            const aspect = frame.rect.height ? frame.rect.width / frame.rect.height : 1;
            node.getComponent(UITransform)!.setContentSize(height * aspect, height);
            node.active = true;
            node.setPosition(rect.x + rect.width / 2, rect.y + rect.height / 2, 0);
        }
        for (const [ordinal, node] of this._slots) {
            if (live.has(ordinal)) continue;
            this._slots.delete(ordinal);
            node.destroy();
        }
    }

    /** Removes every child sprite this layer created. */
    dispose (): void {
        this._slots.forEach((node) => node.destroy());
        this._slots.clear();
        this._frames.clear();
        this._warned.clear();
        this._seen = -1;
    }

    protected start (): void {
        this.sync();
    }

    /** Re-syncs after text changes or a registered frame arrives, changes or is removed. */
    protected update (): void {
        const revision = this.glyphText.meshRevision;
        if (revision === this._seen) return;
        this._seen = revision;
        this.sync();
    }

    protected onDestroy (): void {
        this.dispose();
        super.onDestroy?.();
    }

    private _slotNode (ordinal: number): Node {
        const existing = this._slots.get(ordinal);
        if (existing && existing.isValid) return existing;
        const node = new Node(`icon-${ordinal}`);
        node.layer = this.node.layer;
        node.setParent(this.node);
        node.addComponent(UITransform).setAnchorPoint(0.5, 0.5);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this._slots.set(ordinal, node);
        return node;
    }
}
