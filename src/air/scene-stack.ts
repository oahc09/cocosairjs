/**
 * Cocos Air — 业务导航层：常驻页面 Node 的场景栈（W10，Code First 与 Web 可靠性任务清单）。
 *
 * 两种模式显式分立（任务书 W10）：
 * 1. `runSceneImmediate` 替换销毁——引擎原生语义（createAirApp/app.run 既有面，不在本层）；
 * 2. 业务导航层常驻页面 Node——本模块：单一长驻 Scene 内以 Node 子树为「页面」，
 *    push/pop + 过渡期双页同绘 + 输入屏蔽 + 返回页状态保存（active=false 保活，不销毁）
 *    + 缓存上限 LRU 释放。
 *
 * 过渡使用同一主循环与相机约定（无第二渲染循环）；转场取消与快速重复切换由
 * 「新导航立即取代在途转场」语义处理。本文件为 Air 原创。
 */

import { Node } from '../cocos/scene-graph/node';
import { Scene } from '../cocos/scene-graph/scene';
import { isValid } from '../cocos/core/data/object';

/** @en A persistent page handle. @zh 常驻页面句柄。 */
export interface PageHandle {
    readonly name: string;
    readonly node: Node;
    /** 页面当前是否处于展示态（栈顶且未在隐藏保活）。 */
    readonly visible: boolean;
}

/** @en Page factory. @zh 页面工厂：构建页面 Node 子树（常驻语义——内容由调用方维护状态）。 */
export type PageBuilder = () => Node;

/** @en Options for [[SceneStack.push]]. @zh push 选项。 */
export interface PushOptions {
    /** 过渡毫秒（双页同绘窗口；0 = 立即切换）。默认 0。 */
    transitionMs?: number;
}

/** @en Options for [[SceneStack]] constructor. @zh SceneStack 选项。 */
export interface SceneStackOptions {
    /** 非激活页面的缓存上限（LRU 超限销毁最旧页；默认 4）。 */
    maxCachedPages?: number;
    /** 输入屏蔽挂载的画布（默认 document.getElementById('GameCanvas')）。 */
    canvas?: HTMLCanvasElement | null;
}

/**
 * @en Persistent-page navigation stack inside one long-lived scene.
 * @zh 单一长驻场景内的常驻页面导航栈。
 */
export class SceneStack {
    private readonly _scene: Scene;
    private readonly _maxCached: number;
    private readonly _stack: PageHandle[] = [];
    private readonly _cache: PageHandle[] = []; // LRU：尾部最新
    private _transitionTimer: ReturnType<typeof setTimeout> | null = null;
    private _transitionResolve: ((handle: PageHandle) => void) | null = null;
    private _blockListener: ((e: Event) => void) | null = null;
    private _canvas: HTMLCanvasElement | null;
    /** 过渡期输入被屏蔽的累计次数（测试观测面）。 */
    inputBlockedCount = 0;

    constructor (scene: Scene, options: SceneStackOptions = {}) {
        this._scene = scene;
        this._maxCached = options.maxCachedPages ?? 4;
        this._canvas = options.canvas
            ?? (typeof document !== 'undefined' ? document.getElementById('GameCanvas') as HTMLCanvasElement | null : null);
    }

    /** 当前展示的页面（栈顶），空栈为 null。 */
    get top (): PageHandle | null { return this._stack[this._stack.length - 1] ?? null; }
    get depth (): number { return this._stack.length; }
    get cachedCount (): number { return this._cache.length; }
    get inTransition (): boolean { return this._transitionTimer !== null; }

    /**
     * @en Push a page. During `transitionMs` both pages render (dual-page window) and input is
     * blocked; a new navigation supersedes (finishes) an in-flight transition immediately.
     * @zh 压入页面。transitionMs 窗口内双页同绘且输入屏蔽；在途转场被新导航立即收口
     * （转场取消/快速重复切换语义）。
     */
    push (build: PageBuilder, name: string, options: PushOptions = {}): Promise<PageHandle> {
        this._finishTransition();
        const node = build();
        this._scene.addChild(node);
        const handle: PageHandle = { name, node, visible: true } as PageHandle;
        // 旧栈顶进入过渡同绘（保持 active），过渡结束后隐藏保活或按缓存策略处理
        this._stack.push(handle);
        const previous = this._stack[this._stack.length - 2];
        const ms = options.transitionMs ?? 0;
        if (ms <= 0) {
            this._retire(previous);
            return Promise.resolve(handle);
        }
        this._beginInputBlock();
        return new Promise<PageHandle>((resolve) => {
            this._transitionResolve = resolve;
            this._transitionTimer = setTimeout(() => {
                this._transitionTimer = null;
                this._transitionResolve = null;
                this._endInputBlock();
                this._retire(previous);
                resolve(handle);
            }, ms);
        });
    }

    /**
     * @en Pop the top page: it is destroyed (its subtree's state ends with it); the previous
     * cached page becomes visible again with its state preserved.
     * @zh 弹出栈顶：销毁该页；前一缓存页重新可见且状态保留（active 恢复）。
     */
    pop (): Promise<PageHandle | null> {
        this._finishTransition();
        const popped = this._stack.pop();
        if (!popped) { return Promise.resolve(null); }
        popped.node.destroy();
        const next = this._stack[this._stack.length - 1];
        if (next) {
            const idx = this._cache.indexOf(next);
            if (idx >= 0) { this._cache.splice(idx, 1); }
            next.node.active = true;
            (next as { visible: boolean }).visible = true;
        }
        return Promise.resolve(popped);
    }

    /** @en Finish an in-flight transition immediately (cancellation; its promise resolves). @zh 立即收口在途转场（其 promise 随之 settle——被新导航取代时不悬挂等待者）。 */
    private _finishTransition (): void {
        if (this._transitionTimer !== null) {
            clearTimeout(this._transitionTimer);
            this._transitionTimer = null;
            this._endInputBlock();
            const resolve = this._transitionResolve;
            this._transitionResolve = null;
            // 收口语义：栈顶之下全部退隐（同 push 完成路径），并 resolve 在途等待者
            for (const page of this._stack.slice(0, -1)) { this._retire(page); }
            if (resolve) { resolve(this._stack[this._stack.length - 1]!); }
        }
    }

    private _retire (page: PageHandle | undefined): void {
        if (!page) { return; }
        if (this._cache.includes(page)) { return; }
        // 状态保存：active=false 保活（组件与子树状态保留）；缓存上限 LRU 超限销毁最旧
        page.node.active = false;
        (page as { visible: boolean }).visible = false;
        this._cache.push(page);
        while (this._cache.length > this._maxCached) {
            const oldest = this._cache.shift()!;
            // An evicted page cannot be returned to by pop(): remove its handle from
            // the navigation stack before destroying its node.
            const index = this._stack.indexOf(oldest);
            if (index >= 0) { this._stack.splice(index, 1); }
            oldest.node.destroy();
        }
    }

    /**
     * @en Block engine input during transitions: a capture-phase listener on the canvas that
     * stops the event before PAL handlers (same element, earlier phase) run.
     * @zh 过渡期屏蔽引擎输入：在画布上以捕获阶段监听并截停（同元素早于 PAL 的冒泡监听）。
     */
    private _beginInputBlock (): void {
        if (!this._canvas || this._blockListener) { return; }
        this._blockListener = (e: Event): void => {
            this.inputBlockedCount += 1;
            e.stopImmediatePropagation();
        };
        for (const type of ['mousedown', 'mouseup', 'mousemove', 'touchstart', 'touchmove', 'touchend', 'keydown', 'keyup', 'wheel']) {
            this._canvas.addEventListener(type, this._blockListener, { capture: true });
        }
    }

    private _endInputBlock (): void {
        if (!this._canvas || !this._blockListener) { return; }
        for (const type of ['mousedown', 'mouseup', 'mousemove', 'touchstart', 'touchmove', 'touchend', 'keydown', 'keyup', 'wheel']) {
            this._canvas.removeEventListener(type, this._blockListener, { capture: true } as EventListenerOptions);
        }
        this._blockListener = null;
    }

    /** @en Cleanup（测试/页面销毁）。 @zh 清理：摘除屏蔽监听并销毁全部页面。 */
    dispose (): void {
        this._finishTransition();
        this._endInputBlock();
        for (const page of this._stack) { if (isValid(page.node)) { page.node.destroy(); } }
        for (const page of this._cache) { if (isValid(page.node)) { page.node.destroy(); } }
        this._stack.length = 0;
        this._cache.length = 0;
    }
}
