import { Node } from '../../src/cocos/scene-graph/node';
import { NodeEventType } from '../../src/cocos/scene-graph/node-event';
import { createAirApp } from '../../src';
import { Scene } from '../../src/cocos/scene-graph/scene';
import { UITransform } from '../../src/cocos/2d/framework/ui-transform';
import { Sprite } from '../../src/cocos/2d/components/sprite';
import { Label } from '../../src/cocos/2d/components/label';
import { SpriteFrame } from '../../src/cocos/2d/assets/sprite-frame';
import { Rect, Size } from '../../src/cocos/core/math';
import { AirContentSizeFitter, AirFitMeasure } from '../../src/air/ui-content-size-fitter';

function makeNode(name: string, width: number, height: number, anchor = 0.5): Node {
    const node = new Node(name);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);
    transform.setAnchorPoint(anchor, anchor);
    return node;
}

function addChild(parent: Node, x: number, y: number, width: number, height: number, anchor = 0.5): Node {
    const child = makeNode('child', width, height, anchor);
    child.setPosition(x, y, 0);
    parent.addChild(child);
    return child;
}

function fitter(node: Node, horizontal: string, vertical: string): AirContentSizeFitter {
    const component = node.addComponent(AirContentSizeFitter);
    component.horizontalFit = horizontal as any;
    component.verticalFit = vertical as any;
    return component;
}

function sizeOf(node: Node): number[] {
    const transform = node.getComponent(UITransform)!;
    return [transform.width, transform.height];
}

function tick(component: AirContentSizeFitter): void {
    (component as any).update(0.016);
}

describe('AirContentSizeFitter', () => {
    let app: Awaited<ReturnType<typeof createAirApp>>;

    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });

    afterAll(async () => {
        await app.close?.();
    });

    /** onEnable/onDisable dispatch only under a running scene — that is where the event wiring lives. */
    function activate(node: Node): Scene {
        const scene = new Scene('fitter-scene');
        scene.addChild(node);
        app.run(scene);
        return scene;
    }

    test('children bounding box respects the container anchor split', () => {
        const container = makeNode('box', 10, 10, 0.5);
        addChild(container, 0, 0, 20, 10);
        addChild(container, 30, -5, 10, 10, 0);
        const component = fitter(container, 'preferred', 'preferred');
        expect(component.fitNow()).toBe(true);
        expect(sizeOf(container)).toEqual([80, 10]);

        container.getComponent(UITransform)!.setAnchorPoint(0, 0);
        component.markDirty();
        expect(component.fitNow()).toBe(true);
        expect(sizeOf(container)).toEqual([40, 5]);
        container.destroy();
    });

    test('inactive and non-UI children are skipped; child scale only counts when affectedByScale', () => {
        const container = makeNode('box', 10, 10, 0);
        const kept = addChild(container, 10, 0, 10, 10, 0);
        const skipped = addChild(container, 500, 0, 10, 10, 0);
        skipped.active = false;
        container.addChild(new Node('plain'));
        const component = fitter(container, 'preferred', 'preferred');
        expect(component.fitNow()).toBe(true);
        expect(sizeOf(container)).toEqual([20, 10]);

        kept.setScale(2, 1, 1);
        expect(component.fitNow()).toBe(false);
        expect(sizeOf(container)).toEqual([20, 10]);
        component.affectedByScale = true;
        expect(component.fitNow()).toBe(true);
        expect(sizeOf(container)).toEqual([30, 10]);
        container.destroy();
    });

    test('sprite frames measure TRIMMED and RAW; CUSTOM contributes nothing', () => {
        const frame = new SpriteFrame();
        frame.rect = new Rect(4, 4, 64, 32);
        frame.originalSize = new Size(80, 48);

        const trimmed = makeNode('trimmed', 1, 1);
        const trimmedSprite = trimmed.addComponent(Sprite);
        trimmedSprite.sizeMode = Sprite.SizeMode.TRIMMED;
        trimmedSprite.spriteFrame = frame;
        trimmed.getComponent(UITransform)!.setContentSize(1, 1);
        fitter(trimmed, 'preferred', 'preferred').fitNow();
        expect(sizeOf(trimmed)).toEqual([64, 32]);

        const raw = makeNode('raw', 1, 1);
        const rawSprite = raw.addComponent(Sprite);
        rawSprite.sizeMode = Sprite.SizeMode.RAW;
        rawSprite.spriteFrame = frame;
        raw.getComponent(UITransform)!.setContentSize(1, 1);
        fitter(raw, 'preferred', 'preferred').fitNow();
        expect(sizeOf(raw)).toEqual([80, 48]);

        const custom = makeNode('custom', 1, 1);
        const customSprite = custom.addComponent(Sprite);
        customSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        customSprite.spriteFrame = frame;
        expect(fitter(custom, 'preferred', 'preferred').fitNow()).toBe(false);
        expect(sizeOf(custom)).toEqual([1, 1]);

        trimmed.destroy();
        raw.destroy();
        custom.destroy();
    });

    test('custom measurer wins over built-ins and separates min from preferred', () => {
        const node = makeNode('card', 10, 10);
        addChild(node, 0, 0, 40, 40);
        const component = node.addComponent(AirContentSizeFitter);
        const seen: string[] = [];
        component.measure = (f) => {
            seen.push(f.node.name);
            const measure: AirFitMeasure = { minWidth: 12, preferredWidth: 96, minHeight: 8, preferredHeight: 64 };
            return measure;
        };
        component.horizontalFit = 'min';
        component.verticalFit = 'min';
        component.fitNow();
        expect(sizeOf(node)).toEqual([12, 8]);
        component.horizontalFit = 'preferred';
        component.fitNow();
        expect(sizeOf(node)).toEqual([96, 8]);
        expect(seen).toEqual(['card', 'card']);
        node.destroy();
    });

    test('a null or invalid measurement leaves the authored size untouched', () => {
        const node = makeNode('empty', 33, 44);
        const component = fitter(node, 'preferred', 'preferred');
        component.measure = () => null;
        expect(component.fitNow()).toBe(false);
        component.measure = () => ({ minWidth: NaN, preferredHeight: -2 });
        expect(component.fitNow()).toBe(false);
        expect(sizeOf(node)).toEqual([33, 44]);
        node.destroy();
    });

    test('unchanged sizes stay quiet while a real change emits SIZE_CHANGED for upstream Layout', () => {
        const node = makeNode('quiet', 8, 8, 0);
        const component = fitter(node, 'off', 'off');
        addChild(node, 10, 0, 10, 10, 0);
        expect(component.fitNow()).toBe(false);

        component.horizontalFit = 'preferred';
        let sizeChanged = 0;
        node.on(NodeEventType.SIZE_CHANGED, () => sizeChanged++);
        expect(component.fitNow()).toBe(true);
        expect(sizeOf(node)).toEqual([20, 8]);
        expect(sizeChanged).toBe(1);
        expect(component.fitNow()).toBe(false);
        expect(sizeChanged).toBe(1);
        node.destroy();
    });

    test('update fits only when dirty and autoFit is on', () => {
        const node = makeNode('tick', 4, 4, 0);
        const component = fitter(node, 'preferred', 'preferred');
        addChild(node, 8, 0, 8, 8, 0);
        component.markDirty();
        component.autoFit = false;
        tick(component);
        expect(sizeOf(node)).toEqual([4, 4]);

        component.autoFit = true;
        tick(component);
        expect(sizeOf(node)).toEqual([16, 8]);
        tick(component);
        expect(sizeOf(node)).toEqual([16, 8]);
        node.destroy();
    });

    test('the label branch refreshes render data and reports the size Label owns', () => {
        const node = makeNode('label', 77, 55);
        const label = node.addComponent(Label);
        const spy = jest.spyOn(label, 'updateRenderData');
        const component = fitter(node, 'preferred', 'preferred');
        expect(component.fitNow()).toBe(false);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith();
        expect(sizeOf(node)).toEqual([77, 55]);

        label.enabled = false;
        addChild(node, 0, 0, 30, 20, 0);
        spy.mockClear();
        // The child rect spans [0, 30] while the container anchor is 0.5, so enclosing it
        // needs a 60-wide container.
        expect(component.fitNow()).toBe(true);
        expect(spy).not.toHaveBeenCalled();
        expect(sizeOf(node)).toEqual([60, 40]);
        node.destroy();
    });

    test('a child that lays out later wakes the fitter up through node events', () => {
        const node = makeNode('card', 0, 0);
        const child = addChild(node, 0, 0, 0, 0);
        const component = fitter(node, 'preferred', 'preferred');
        const scene = activate(node);
        tick(component);
        expect(sizeOf(node)).toEqual([0, 0]);

        child.getComponent(UITransform)!.setContentSize(120, 40);
        tick(component);
        expect(sizeOf(node)).toEqual([120, 40]);

        node.removeChild(child);
        tick(component);
        expect(sizeOf(node)).toEqual([120, 40]);
        scene.destroy();
    });

    test('disable stops the chase and re-enable refits from current content', () => {
        const node = makeNode('card', 20, 20);
        const child = addChild(node, 0, 0, 10, 10);
        const component = fitter(node, 'preferred', 'preferred');
        const scene = activate(node);
        tick(component);
        expect(sizeOf(node)).toEqual([10, 10]);

        component.enabled = false;
        child.getComponent(UITransform)!.setContentSize(300, 300);
        tick(component);
        expect(sizeOf(node)).toEqual([10, 10]);

        component.enabled = true;
        tick(component);
        expect(sizeOf(node)).toEqual([300, 300]);
        scene.destroy();
    });

    test('bad fit modes and bad measurers fail with AIR_E_FIT', () => {
        const node = makeNode('bad', 1, 1);
        const component = node.addComponent(AirContentSizeFitter);
        expect(() => {
            component.horizontalFit = 'bogus' as any;
        }).toThrow('AIR_E_FIT');
        expect(() => {
            component.verticalFit = undefined as any;
        }).toThrow('AIR_E_FIT');
        expect(() => {
            component.measure = 42 as any;
        }).toThrow('AIR_E_FIT');
        expect(component.horizontalFit).toBe('off');
        expect(component.verticalFit).toBe('off');
        expect(component.measure).toBeNull();
        expect(() => {
            component.fitNow();
        }).not.toThrow();
        node.destroy();
    });
});
