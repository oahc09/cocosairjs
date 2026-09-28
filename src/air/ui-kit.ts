/**
 * Cocos Air — 可选 2D Code First 辅助包（W09，Code First 与 Web 可靠性任务清单）。
 *
 * 最小工具集：createUICanvas / spriteNode / labelNode / AssetBank。全部复用原生
 * Node/UITransform/Sprite/Label/Camera/Canvas，不创建平行 Scene/Node 抽象；
 * createAirApp 不承载业务布局。按任务书为「可选面」——不并入默认导出也不影响核心。
 *
 * 本文件为 Air 原创（上游 cocos4 无同名文件）。
 */

import { Node } from '../cocos/scene-graph/node';
import { UITransform } from '../cocos/2d/framework/ui-transform';
import { Canvas } from '../cocos/2d/framework/canvas';
import { Camera } from '../cocos/misc/camera-component';
import { Widget } from '../cocos/ui/widget';
import { Sprite } from '../cocos/2d/components/sprite';
import { Label } from '../cocos/2d/components/label';
import { Color } from '../cocos/core/math';
import { Layers } from '../cocos/scene-graph/layers';
import { Scene } from '../cocos/scene-graph/scene';
import { assetManager } from '../cocos/asset/asset-manager';
import { Asset } from '../cocos/asset/assets/asset';

/** @en Options for [[createUICanvas]]. @zh createUICanvas 选项。 */
export interface UICanvasOptions {
    /** 设计宽高（默认 1280×720）。 */
    designWidth?: number;
    designHeight?: number;
    /** UI 可见层（默认 Layers.Enum.UI_2D）。 */
    layer?: number;
}

/**
 * @en Assemble a fullscreen UI Canvas (Canvas + Widget + ortho UI camera) under the scene.
 * @zh 在场景内组装全屏 UI Canvas（Canvas + Widget 全对齐 + 正交 UI 相机）。
 * 返回 canvas 根节点；相机挂在其子节点上并已链接 `canvasComponent.cameraComponent`。
 */
export function createUICanvas (scene: Scene, name = 'UICanvas', options: UICanvasOptions = {}): Node {
    const layer = options.layer ?? Layers.Enum.UI_2D;
    const w = options.designWidth ?? 1280;
    const h = options.designHeight ?? 720;

    const node = new Node(name);
    node.layer = layer;
    const ut = node.addComponent(UITransform);
    ut.setContentSize(w, h);
    ut.setAnchorPoint(0.5, 0.5);
    const canvas = node.addComponent(Canvas) as Canvas;
    const widget = node.addComponent(Widget);
    widget.isAlignLeft = widget.isAlignRight = widget.isAlignTop = widget.isAlignBottom = true;
    widget.left = widget.right = widget.top = widget.bottom = 0;
    widget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
    scene.addChild(node);

    const cameraNode = new Node(name + '/Camera');
    cameraNode.layer = layer;
    cameraNode.addComponent(UITransform).setContentSize(1, 1);
    const camera = cameraNode.addComponent(Camera) as Camera;
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(24, 30, 44, 255);
    camera.visibility = layer;
    camera.near = 1;
    camera.far = 2000;
    node.addChild(cameraNode);
    canvas.cameraComponent = camera;
    return node;
}

/** @en Options for [[spriteNode]]. @zh spriteNode 选项。 */
export interface SpriteNodeOptions {
    size?: [number, number];
    position?: [number, number];
    color?: Color;
    layer?: number;
}

/**
 * @en Create a UI child node with UITransform + Sprite (CUSTOM size mode).
 * @zh 创建带 UITransform + Sprite 的 UI 子节点（CUSTOM 尺寸模式；设 spriteFrame 后即渲染）。
 */
export function spriteNode (parent: Node, name = 'Sprite', options: SpriteNodeOptions = {}): Node {
    const node = new Node(name);
    node.layer = options.layer ?? Layers.Enum.UI_2D;
    const ut = node.addComponent(UITransform);
    ut.setContentSize(options.size?.[0] ?? 100, options.size?.[1] ?? 100);
    ut.setAnchorPoint(0.5, 0.5);
    const sprite = node.addComponent(Sprite) as Sprite;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    if (options.color) { sprite.color = options.color.clone(); }
    if (options.position) { node.setPosition(options.position[0], options.position[1], 0); }
    parent.addChild(node);
    return node;
}

/** @en Options for [[labelNode]]. @zh labelNode 选项。 */
export interface LabelNodeOptions {
    fontSize?: number;
    position?: [number, number];
    color?: Color;
    overflow?: number;
    boxSize?: [number, number];
    layer?: number;
}

/**
 * @en Create a UI child node with UITransform + Label（examples 同款默认排版）。
 * @zh 创建带 UITransform + Label 的 UI 子节点。
 */
export function labelNode (parent: Node, text: string, name = 'Label', options: LabelNodeOptions = {}): Node {
    const node = new Node(name);
    node.layer = options.layer ?? Layers.Enum.UI_2D;
    const fontSize = options.fontSize ?? 28;
    const ut = node.addComponent(UITransform);
    ut.setContentSize(options.boxSize?.[0] ?? 0, options.boxSize?.[1] ?? 0);
    ut.setAnchorPoint(0.5, 0.5);
    const label = node.addComponent(Label) as Label;
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = Math.round(fontSize * 1.25);
    label.color = options.color ?? Color.WHITE.clone();
    if (options.overflow !== undefined) { label.overflow = options.overflow; }
    if (options.position) { node.setPosition(options.position[0], options.position[1], 0); }
    parent.addChild(node);
    return node;
}

type ProgressFn = (current: number, total: number) => void;

interface BankEntry {
    asset: Asset;
    refs: number;
}

/**
 * @en Minimal reference-counted asset bank over `assetManager.loadRemote`.
 * @zh 基于 assetManager.loadRemote 的最小引用计数资产库：
 * - 并发去重：同 URL 在途请求只发一次，等待者共享同一 Promise；
 * - 引用计数：acquire 递增、release 递减，归零才真正 releaseAsset——共享引用不误释放，
 *   释放不影响其他场景持有的资产；
 * - 失败清理：加载失败不留悬挂条目；
 * - 进度：loadRemote 无任务级进度时以 0→100 两阶报告（如实，不伪造细粒度）。
 */
export class AssetBank {
    private _entries = new Map<string, BankEntry>();
    private _inFlight = new Map<string, Promise<Asset>>();

    /** 当前在库条目数（测试观测面）。 */
    get size (): number { return this._entries.size; }

    /** 引用计数（测试观测面）。 */
    refCount (url: string): number { return this._entries.get(url)?.refs ?? 0; }

    /**
     * @en Load (or join the in-flight load of) an asset by URL, incrementing its refcount.
     * @zh 按 URL 加载（或在途合并）资产并递增引用计数。
     */
    load<T extends Asset> (url: string, onProgress?: ProgressFn): Promise<T> {
        const existing = this._entries.get(url);
        if (existing) {
            existing.refs += 1;
            onProgress?.(1, 1);
            return Promise.resolve(existing.asset as T);
        }
        let pending = this._inFlight.get(url);
        if (!pending) {
            pending = new Promise<Asset>((resolve, reject) => {
                assetManager.loadRemote(url, (err, asset) => {
                    if (err || !asset) {
                        this._inFlight.delete(url);
                        reject(new Error(`[AssetBank] load failed: ${url} (${(err && err.message) || err})`));
                        return;
                    }
                    this._inFlight.delete(url);
                    this._entries.set(url, { asset, refs: 0 });
                    resolve(asset);
                });
            });
            this._inFlight.set(url, pending);
        }
        return pending.then((asset) => {
            const entry = this._entries.get(url)!;
            entry.refs += 1;
            onProgress?.(1, 1);
            return asset as T;
        });
    }

    /**
     * @en Decrement the refcount; the asset is released only when it reaches zero.
     * @zh 递减引用计数；归零才真正释放（不破坏其他场景/持有者）。
     */
    release (url: string): boolean {
        const entry = this._entries.get(url);
        if (!entry) { return false; }
        entry.refs -= 1;
        if (entry.refs <= 0) {
            this._entries.delete(url);
            assetManager.releaseAsset(entry.asset);
            return true;
        }
        return false;
    }
}
