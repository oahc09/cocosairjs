import { createAirDOMOverlay } from '../../src/air/dom-overlay';
import { createAirTextureSprite } from '../../src/air/texture-sprite';
import { createAirUIBlendScope } from '../../src/air/ui-blend';
import { Node } from '../../src/cocos/scene-graph/node';
import { Scene } from '../../src/cocos/scene-graph/scene';
import { Sprite } from '../../src/cocos/2d/components/sprite';
import { Texture2D } from '../../src/cocos/asset/assets/texture-2d';
import { UITransform } from '../../src/cocos/2d/framework/ui-transform';
import { BlendFactor } from '../../src/cocos/gfx';
import { ParticleSystem2D } from '../../src/cocos/particle-2d/particle-system-2d';

describe('DOM, texture sprite and opt-in blend ownership', () => {
    test('DOM elements restore original order/styles; duplicate and disposed bindings reject', () => {
        const host = document.createElement('div'), canvas = document.createElement('canvas'), element = document.createElement('input'), sibling = document.createElement('span');
        element.style.color = 'red'; host.append(element, sibling); document.body.append(host, canvas);
        const overlay = createAirDOMOverlay({ canvas }); const node = new Node();
        const binding = overlay.attach(element, node, {} as any, { width: 100, height: 30 });
        expect(overlay.root.contains(element)).toBe(true); expect(element.style.width).toBe('100px');
        expect(() => overlay.attach(element, node, {} as any)).toThrow('AIR_E_DOM_OVERLAY_ELEMENT');
        binding.dispose(); binding.dispose(); expect(host.firstChild).toBe(element); expect(element.style.width).toBe(''); expect(element.style.color).toBe('red');
        overlay.dispose(); expect(overlay.root.isConnected).toBe(false); expect(() => overlay.update()).toThrow('DISPOSED'); host.remove(); canvas.remove(); node.destroy();
    });
    test('texture Sprite defaults and refresh borrow texture without changing anchor metadata', () => {
        const scene = new Scene(), texture = new Texture2D(); texture.reset({ width: 20, height: 10 });
        const handle = createAirTextureSprite(scene, texture, { anchor: [0, 1] });
        expect(handle.node.getComponent(UITransform)!.anchorX).toBe(0); expect(handle.node.getComponent(UITransform)!.anchorY).toBe(1);
        expect(handle.node.getComponent(UITransform)!.width).toBe(20); texture.reset({ width: 40, height: 30 }); handle.refresh();
        expect(handle.frame.rect.width).toBe(40); expect(handle.node.getComponent(UITransform)!.height).toBe(30);
        handle.dispose(); handle.dispose(); expect(texture.isValid).toBe(true); expect(handle.sprite.spriteFrame).toBe(null);
        expect(() => handle.refresh()).toThrow('DISPOSED'); texture.destroy(); scene.destroy();
    });
    test('child override, reparent, particle inheritance and dispose restore native factors', () => {
        const root = new Node(), child = new Node(), outside = new Node(); root.addChild(child);
        const particleNode = new Node(); child.addChild(particleNode);
        const sprite = child.addComponent(Sprite), particles = particleNode.addComponent(ParticleSystem2D);
        const scope = createAirUIBlendScope(root, 'add');
        expect((sprite as any)._dstBlendFactor).toBe(BlendFactor.ONE); expect((particles as any)._dstBlendFactor).toBe(BlendFactor.ONE);
        scope.set(child, 'multiply'); expect(sprite.srcBlendFactor).toBe(BlendFactor.DST_COLOR);
        scope.set(child, null); expect(sprite.srcBlendFactor).toBe(BlendFactor.SRC_ALPHA);
        child.setParent(outside); scope.update(); expect((sprite as any)._dstBlendFactor).toBe(BlendFactor.ONE_MINUS_SRC_ALPHA);
        child.setParent(root); scope.update(); scope.dispose(); expect((particles as any)._dstBlendFactor).toBe(BlendFactor.ONE_MINUS_SRC_ALPHA);
        expect(() => scope.update()).toThrow('DISPOSED'); root.destroy(); outside.destroy();
    });
});
