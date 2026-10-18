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
 * Cocos Air — 逐字打字机（AIR 原创，上游 cocos4 无同名文件）。
 *
 * 对齐的是本作实际使用的组件：Febucci `TypewriterByCharacter : TypewriterCore`
 * （`_re/il2cpp/dump.cs:495502`、`:497428`），字段名尽量保持原义，方便复刻侧一对一接线：
 * - `waitForNormalChars` / `waitMiddle` / `waitLong` / `avoidMultiplePunctuactionWait`
 *   / `waitForNewLines` / `waitForLastCharacter`（dump.cs:495506-495516）；
 * - 消失阶段 `useTypewriterWaitForDisappearances` / `disappearanceWaitTime`
 *   / `disappearanceSpeedMultiplier`（dump.cs:495518-495522）；
 * - 跳过 `SkipTypewriter()` / `StopShowingText()` 与 `hideAppearancesOnSkip`
 *   / `triggerEventsOnSkip`（dump.cs:497483、:497506、:497436-497439）；
 * - 事件 `onTypewriterStart` / `onCharacterVisible(char)` / `onTextShowed` / `onTextDisappeared`
 *   （dump.cs:497444-497448）。`TAnimSoundWriter.OnCharacter(char)`（dump.cs:70708，场景里
 *   与 30 个打字机 1:1 配对）就是 `onCharacterVisible` 的订阅者。
 *
 * 差异（有意为之，不假装逐位复刻）：
 * - Unity 用协程（`showRoutine`/`hideRoutine`，dump.cs:497451-497456），这里用 `update(dt)`
 *   累加计时器，行为等价且不需要协程调度器；
 * - 驱动的是 `AirGlyphText.maxVisibleCharacters`（排版不动、逐字显形），不是 `Label.string`
 *   前缀切片——后者会让居中/右对齐文本逐字抖动；
 * - `onMessage`（Febucci 的 `<message>` 标记事件）不在本文件范围内：标记语法要等富文本
 *   标签解析一起落地；
 * - 具体的等待时长是原作用户在 prefab 里序列化的数值，二进制导出里没有（见
 *   `_re/report-logic-inventory.md` §4.1 只给到实例数），所以下面的默认值是占位默认，
 *   不是从本作里读出来的。
 */
import { ccclass, requireComponent } from 'cc.decorator';
import { Component } from '../cocos/scene-graph/component';
import { AirGlyphText } from './ui-glyph-text';

const LONG_PUNCTUATION = '.!?…。！？';
const MIDDLE_PUNCTUATION = ',;:—、，；：';

function fail (message: string): never {
    const error = new Error(`AIR_E_TYPEWRITER: ${message}`);
    Object.assign(error, { code: 'AIR_E_TYPEWRITER' });
    throw error;
}

export interface AirTypewriterEvents {
    /** Fired once when a reveal/hide pass starts. */
    onTypewriterStart?: () => void;
    /** Fired per revealed grapheme — the typewriter-sound hook (`TAnimSoundWriter.OnCharacter`). */
    onCharacterVisible?: (grapheme: string) => void;
    /** Fired when the last grapheme has been revealed. */
    onTextShowed?: () => void;
    /** Fired when the hide pass has emptied the text. */
    onTextDisappeared?: () => void;
}

/**
 * Per-character reveal for an `AirGlyphText`. Timing is in seconds per grapheme, with
 * punctuation and newline overrides, matching the Febucci parameter model.
 */
@ccclass('AirTypewriter')
@requireComponent(AirGlyphText)
export class AirTypewriter extends Component {
    /** Master switch: when false, `showText()` reveals instantly. */
    useTypewriter = true;
    /** Whether `onEnable`/`start` should kick off a reveal automatically. */
    startTypewriterMode = true;

    waitForNormalChars = 0.03;
    waitMiddle = 0.15;
    waitLong = 0.35;
    /** Consecutive punctuation waits only once (e.g. "?!" or "…"). */
    avoidMultiplePunctuationWait = true;
    waitForNewLines = 0.25;
    waitForLastCharacter = 0;

    useTypewriterWaitForDisappearances = false;
    disappearanceWaitTime = 0.03;
    disappearanceSpeedMultiplier = 1;

    /** On skip, jump straight to the fully revealed (or fully hidden) state. */
    hideAppearancesOnSkip = true;
    /** Whether a skip still fires `onCharacterVisible` for the skipped graphemes. */
    triggerEventsOnSkip = false;

    onTypewriterStart?: () => void;
    onCharacterVisible?: (grapheme: string) => void;
    onTextShowed?: () => void;
    onTextDisappeared?: () => void;

    private _text: AirGlyphText | null = null;
    private _showing = false;
    private _hiding = false;
    private _index = 0;
    private _timer = 0;
    private _pendingWait = 0;

    get isShowingText (): boolean {
        return this._showing;
    }

    get isHidingText (): boolean {
        return this._hiding;
    }

    /** Graphemes revealed so far. */
    get visibleCharacterCount (): number {
        return this._index;
    }

    get glyphText (): AirGlyphText {
        if (!this._text) {
            this._text = this.getComponent(AirGlyphText);
            if (!this._text) fail('requires an AirGlyphText on the same node');
        }
        return this._text!;
    }

    /** Assigns the string and starts the reveal pass. Returns the grapheme count being revealed. */
    showText (value?: string): number {
        const target = this.glyphText;
        if (value !== undefined) target.string = value;
        this._reset();
        if (!this.useTypewriter) {
            target.maxVisibleCharacters = Infinity;
            return target.characterCount;
        }
        this._showing = true;
        this._hiding = false;
        this.onTypewriterStart?.();
        return target.characterCount;
    }

    /** Starts the reverse pass, emptying the text one grapheme at a time. */
    hideText (): void {
        const target = this.glyphText;
        this._reset();
        this._index = target.characterCount;
        target.maxVisibleCharacters = Infinity;
        this._pendingWait = this._hideWait();
        this._hiding = true;
        this._showing = false;
        this.onTypewriterStart?.();
    }

    /** Jumps to the end of the current pass — the dialogue "skip" input. */
    skip (): void {
        const target = this.glyphText;
        const count = target.characterCount;
        if (this.hideAppearancesOnSkip) target.clearCharacterAlphas();
        if (this._hiding) {
            this._emitRange(this._index, 0);
            this._index = 0;
            target.maxVisibleCharacters = 0;
            this._hiding = false;
            this.onTextDisappeared?.();
            return;
        }
        if (!this._showing) return;
        this._emitRange(this._index, count);
        this._index = count;
        target.maxVisibleCharacters = Infinity;
        this._showing = false;
        this.onTextShowed?.();
    }

    /** Stops the reveal pass where it is, leaving the currently visible prefix on screen. */
    stopShowingText (): void {
        this._showing = false;
        this._hiding = false;
        this._timer = 0;
    }

    /** Seconds still needed at the current position — 0 while idle or hiding. */
    get remainingTime (): number {
        if (!this._showing) return 0;
        const target = this.glyphText;
        const count = target.characterCount;
        let total = Math.max(0, this._pendingWait - this._timer);
        for (let i = this._index + 1; i < count; i++) total += this._waitOf(target, i);
        return total;
    }

    protected start (): void {
        if (!this.startTypewriterMode || this.glyphText.characterCount === 0) return;
        this.showText();
    }

    protected update (dt: number): void {
        if (!this._showing && !this._hiding) return;
        if (dt < 0 || !Number.isFinite(dt)) fail(`dt must be a finite number >= 0, got ${dt}`);
        this._timer += dt;
        // One tick can cross several short waits; loop but never spin past the string end.
        let guard = 0;
        while ((this._showing || this._hiding) && this._timer >= this._currentWait() && guard++ < 4096) {
            this._timer -= this._currentWait();
            if (this._showing) this._stepShow();
            else this._stepHide();
        }
    }

    private _stepShow (): void {
        const target = this.glyphText;
        const count = target.characterCount;
        if (this._index >= count) {
            this._finishShow(target);
            return;
        }
        target.maxVisibleCharacters = this._index + 1;
        const grapheme = target.glyphAt(this._index)?.char ?? '';
        this.onCharacterVisible?.(grapheme);
        this._index++;
        // The pause is attributed to the grapheme that has not appeared yet; past the last one only
        // `waitForLastCharacter` is left before the pass finishes.
        this._pendingWait = this._index >= count ? this.waitForLastCharacter : this._waitOf(target, this._index);
    }

    private _stepHide (): void {
        const target = this.glyphText;
        if (this._index <= 0) {
            this._hiding = false;
            this.onTextDisappeared?.();
            return;
        }
        this._index--;
        target.maxVisibleCharacters = this._index;
        this._pendingWait = this._hideWait();
    }

    private _finishShow (target: AirGlyphText): void {
        this._showing = false;
        target.maxVisibleCharacters = Infinity;
        this.onTextShowed?.();
    }

    private _emitRange (from: number, to: number): void {
        if (!this.triggerEventsOnSkip || to <= from) return;
        const target = this.glyphText;
        for (let i = from; i < to; i++) this.onCharacterVisible?.(target.glyphAt(i)?.char ?? '');
    }

    private _currentWait (): number {
        return this._hiding ? this._hideWait() : this._pendingWait;
    }

    private _hideWait (): number {
        return this.useTypewriterWaitForDisappearances
            ? this.disappearanceWaitTime * (this.disappearanceSpeedMultiplier || 1)
            : 0;
    }

    /** Delay that comes before grapheme `index` appears. */
    private _waitOf (target: AirGlyphText, index: number): number {
        if (target.isLineStartFromBreak(index)) return this.waitForNewLines;
        const grapheme = target.glyphAt(index)?.char ?? '';
        const punctuation = this._isLong(grapheme) ? this.waitLong : this._isMiddle(grapheme) ? this.waitMiddle : 0;
        if (punctuation > 0) {
            if (this.avoidMultiplePunctuationWait && this._isPunctuation(target.glyphAt(index - 1)?.char ?? '')) {
                // "?!" or "…" should pause once, not once per mark.
                return this.waitForNormalChars;
            }
            return punctuation;
        }
        return this.waitForNormalChars;
    }

    private _isPunctuation (grapheme: string): boolean {
        return this._isLong(grapheme) || this._isMiddle(grapheme);
    }

    private _isLong (grapheme: string): boolean {
        return grapheme.length > 0 && LONG_PUNCTUATION.indexOf(grapheme) >= 0;
    }

    private _isMiddle (grapheme: string): boolean {
        return grapheme.length > 0 && MIDDLE_PUNCTUATION.indexOf(grapheme) >= 0;
    }

    private _reset (): void {
        this.glyphText.maxVisibleCharacters = 0;
        this._index = 0;
        this._timer = 0;
        this._pendingWait = this._waitOf(this.glyphText, 0);
    }
}
