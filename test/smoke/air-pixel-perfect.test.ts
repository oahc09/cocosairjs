import { Node } from '../../src/cocos/scene-graph/node';
import { Scene } from '../../src/cocos/scene-graph/scene';
import { UITransform } from '../../src/cocos/2d/framework/ui-transform';
import { Canvas } from '../../src/cocos/2d/framework/canvas';
import { Camera } from '../../src/cocos/misc/camera-component';
import { screen } from '../../src/cocos/core/platform/screen';
import { DirectorEvent, director } from '../../src/cocos/game/director';
import { createAirApp } from '../../src';
import {
    AirPixelGrid,
    AirPixelPerfect,
    AirPixelViewport,
    airPixelOrtho,
    resolveAirPixelRatio,
} from '../../src/air/ui-pixel-perfect';

/** Square 1920×1080 window with a 1:1 UI camera: one device pixel per UI unit. */
function viewport(over: Partial<AirPixelViewport> = {}): AirPixelViewport {
    return {
        windowWidth: 1920,
        windowHeight: 1080,
        viewportX: 0,
        viewportY: 0,
        viewportWidth: 1,
        viewportHeight: 1,
        cameraX: 0,
        cameraY: 0,
        orthoHeight: 540,
        orthoWidth: 960,
        ...over,
    };
}

function isPixelAligned(grid: AirPixelGrid, x: number, y: number): boolean {
    const px = grid.toPixelX(x);
    const py = grid.toPixelY(y);
    return Math.abs(px - Math.round(px)) < 1e-9 && Math.abs(py - Math.round(py)) < 1e-9;
}

function makeUiNode(name: string, width: number, height: number, anchor = 0.5): Node {
    const node = new Node(name);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);
    transform.setAnchorPoint(anchor, anchor);
    return node;
}

describe('AirPixelGrid math', () => {
    test('automatic ratio rounds the visible height onto an integer scale', () => {
        expect(resolveAirPixelRatio(viewport({ windowHeight: 2160 }))).toBe(2);
        expect(resolveAirPixelRatio(viewport({ windowHeight: 3240 }))).toBe(3);
    });

    test('rounding mode decides the 1.94 case', () => {
        const vp = viewport({ windowHeight: 2100 });
        expect(resolveAirPixelRatio(vp, { rounding: 'nearest' })).toBe(2);
        expect(resolveAirPixelRatio(vp, { rounding: 'down' })).toBe(1);
    });

    test('a buffer smaller than the reference never scales below 1:1', () => {
        expect(resolveAirPixelRatio(viewport({ windowHeight: 540 }))).toBe(1);
        expect(resolveAirPixelRatio(viewport({ windowHeight: 540 }), { rounding: 'down' })).toBe(1);
    });

    test('referenceHeight decouples the ratio from the current ortho size', () => {
        // 2160 device px over a 540-unit reference area is 4, whatever the camera shows now.
        expect(resolveAirPixelRatio(viewport({ windowHeight: 2160 }), { referenceHeight: 540 })).toBe(4);
    });

    test('an explicit ratio wins over the automatic one', () => {
        expect(resolveAirPixelRatio(viewport({ windowHeight: 2160 }), { pixelRatio: 3 })).toBe(3);
    });

    test('airPixelOrtho converts the ratio back into half sizes', () => {
        expect(airPixelOrtho(viewport({ windowHeight: 2160 }), 2)).toEqual({ orthoHeight: 540, orthoWidth: 480 });
        expect(() => airPixelOrtho(viewport(), 0)).toThrow(/AIR_E_PIXEL/);
    });

    test('the 1:1 grid is anchored at the framebuffer corner', () => {
        const grid = new AirPixelGrid(viewport());
        expect([grid.scaleX, grid.scaleY]).toEqual([1, 1]);
        expect([grid.originX, grid.originY]).toEqual([-960, -540]);
        expect(grid.toPixelX(-960)).toBe(0);
        expect(grid.toPixelY(0)).toBe(540);
    });

    test('rounding lands on the nearest boundary and a tie goes up', () => {
        const grid = new AirPixelGrid(viewport({ orthoHeight: 270, orthoWidth: 480 })); // scale 2
        expect(grid.originX).toBe(-480);
        // Device pixel 0 sits at UI -480, so quarter-pixel offsets are ±0.125 UI units.
        expect(grid.toPixelX(grid.roundX(-479.875))).toBe(0); // 0.25 px -> down
        expect(grid.toPixelX(grid.roundX(-479.75))).toBe(1); // 0.50 px -> up (Math.round breaks +inf)
        expect(grid.toPixelX(grid.roundX(-479.625))).toBe(1); // 0.75 px -> up
        expect(grid.toPixelX(grid.roundX(-480.25))).toBe(0); // -0.50 px also breaks up
        expect(grid.toPixelY(grid.roundY(-270.125))).toBe(0);
    });

    test('an offset viewport with a non-aspect half width snaps on both axes', () => {
        const grid = new AirPixelGrid(
            viewport({
                windowWidth: 1000,
                windowHeight: 900,
                viewportX: 0.1,
                viewportY: 0.2,
                viewportWidth: 0.8,
                viewportHeight: 0.6,
                cameraX: 5.3,
                cameraY: -7.7,
                orthoHeight: 130,
                orthoWidth: 200,
            }),
        );
        expect(grid.scaleX).toBe(2); // 800 px over 400 UI units
        expect(grid.scaleY).toBeCloseTo(540 / 260, 9); // anisotropic on purpose
        for (const x of [-1234.5, -0.2, 0, 5.31, 97.777]) {
            for (const y of [-88.8, 0, 7.71, 42.42]) {
                expect(isPixelAligned(grid, grid.roundX(x), grid.roundY(y))).toBe(true);
            }
        }
    });

    test('an automatic half width follows the viewport aspect', () => {
        const grid = new AirPixelGrid(
            viewport({
                windowWidth: 1000,
                windowHeight: 900,
                viewportX: 0.1,
                viewportY: 0.2,
                viewportWidth: 0.8,
                viewportHeight: 0.6,
                orthoHeight: 130,
                orthoWidth: 0,
            }),
        );
        expect(grid.scaleX).toBeCloseTo(grid.scaleY, 9);
    });

    test('snapRect puts both edges on the grid without drifting the anchor', () => {
        const grid = new AirPixelGrid(viewport({ orthoHeight: 270, orthoWidth: 480 })); // scale 2
        const rect = grid.snapRect(10.4, -3.1, 20.3, 9.7, 0.5, 0.5);
        expect((rect.width * 2) % 1).toBeCloseTo(0, 9);
        expect((rect.height * 2) % 1).toBeCloseTo(0, 9);
        expect(isPixelAligned(grid, rect.x - rect.width * 0.5, rect.y - rect.height * 0.5)).toBe(true);
        expect(isPixelAligned(grid, rect.x + rect.width * 0.5, rect.y + rect.height * 0.5)).toBe(true);
    });

    test('snapRect keeps a corner anchor pinned and never collapses a sub-pixel box', () => {
        const grid = new AirPixelGrid(viewport({ orthoHeight: 270, orthoWidth: 480 })); // scale 2
        const corner = grid.snapRect(0, 0, 10.3, 10.3, 0, 0);
        expect(isPixelAligned(grid, corner.x, corner.y)).toBe(true);
        const hairline = grid.snapRect(0, 0, 0.1, 0.1, 0.5, 0.5);
        expect([hairline.width, hairline.height]).toEqual([0.5, 0.5]); // one device pixel each
    });

    test('a degenerate viewport is rejected', () => {
        expect(() => new AirPixelGrid(viewport({ viewportWidth: 0 }))).toThrow(/AIR_E_PIXEL/);
        expect(() => new AirPixelGrid(viewport({ orthoHeight: 0 }))).toThrow(/AIR_E_PIXEL/);
    });
});

describe('AirPixelPerfect', () => {
    let app: Awaited<ReturnType<typeof createAirApp>>;

    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });

    afterAll(async () => {
        await app.close?.();
    });

    function activate(node: Node): Scene {
        const scene = new Scene('pixel-scene');
        scene.addChild(node);
        app.run(scene);
        return scene;
    }

    /** @en The integer scale actually applied, read back the same way the grid reads it. */
    function appliedScale(camera: Camera): number {
        return screen.windowSize.height / (camera.orthoHeight * 2);
    }

    function attach(node: Node, camera: Camera, ratio: number): AirPixelPerfect {
        const component = node.addComponent(AirPixelPerfect);
        component.camera = camera;
        component.pixelRatioOverride = ratio;
        component.autoSnap = false;
        return component;
    }

    function layer(ratio: number): { root: Node; camera: Camera; component: AirPixelPerfect } {
        const root = makeUiNode('layer', 100, 100);
        const cameraNode = new Node('camera');
        const camera = cameraNode.addComponent(Camera);
        camera.projection = Camera.ProjectionType.ORTHO;
        camera.rect.set(0, 0, 1, 1);
        // Window-relative so the test does not hard-code the jsdom framebuffer size.
        camera.orthoHeight = screen.windowSize.height / (2 * ratio);
        camera.orthoWidth = screen.windowSize.width / (2 * ratio);
        const component = attach(root, camera, ratio);
        return { root, camera, component };
    }

    test('without a camera nothing is claimed and nothing moves', () => {
        const root = makeUiNode('bare', 10, 10);
        const component = root.addComponent(AirPixelPerfect);
        expect(component.snapNow()).toBe(false);
        expect(component.pixelRatio).toBe(0);
        expect(component.roundToPixel(1.25, 2.75, 3)).toEqual({ x: 1.25, y: 2.75, z: 3 });
    });

    test('a disabled camera is left alone', () => {
        const { camera, component } = layer(2);
        camera.enabled = false;
        expect(component.snapNow()).toBe(false);
        camera.enabled = true;
        expect(component.snapNow()).toBe(true);
    });

    test('peekGrid reads the live mapping without touching camera or content', () => {
        const cameraNode = new Node('peek-camera');
        const camera = cameraNode.addComponent(Camera);
        camera.projection = Camera.ProjectionType.ORTHO;
        camera.orthoHeight = screen.windowSize.height / (2 * 2.5);
        camera.orthoWidth = screen.windowSize.width / (2 * 2.5);
        const root = makeUiNode('peek', 100, 100);
        root.setPosition(0.37, 0.37, 0);
        cameraNode.addChild(root);
        const component = root.addComponent(AirPixelPerfect);
        component.camera = camera;
        component.autoSnap = false;

        const grid = component.peekGrid();
        expect(grid).not.toBeNull();
        expect(grid!.scaleY).toBeCloseTo(2.5, 6);
        expect(component.grid).toBeNull();
        expect(camera.orthoHeight).toBeCloseTo(screen.windowSize.height / 5, 6);
        expect(root.worldPosition.x).toBeCloseTo(0.37, 6);
    });

    test('the camera is discovered through the Canvas and wins over its fractional ortho', () => {
        // Hand-built Canvas instead of createUICanvas: the headless harness has no widget manager,
        // so a Widget on the canvas root throws during Canvas.__preload.
        const root = makeUiNode('canvas-root', 100, 100);
        const canvas = root.addComponent(Canvas);
        const cameraNode = new Node('ui-camera');
        const camera = cameraNode.addComponent(Camera);
        camera.projection = Camera.ProjectionType.ORTHO;
        root.addChild(cameraNode);
        canvas.cameraComponent = camera;
        activate(root);

        // Canvas._onResizeCamera just wrote the view-driven, non-integer half height.
        const fractional = camera.orthoHeight;
        expect(appliedScale(camera)).not.toBeCloseTo(2, 6);

        const component = root.addComponent(AirPixelPerfect);
        component.pixelRatioOverride = 2;
        component.autoSnap = false;
        expect(component.snapNow()).toBe(true);
        expect(component.camera).toBe(camera);
        expect(camera.orthoHeight).not.toBeCloseTo(fractional, 6);
        expect(appliedScale(camera)).toBeCloseTo(2, 6);
    });

    test('fractional positions snap onto the grid and a second pass is a no-op', () => {
        const { root, camera, component } = layer(2);
        const a = makeUiNode('a', 10, 10);
        a.setPosition(0.3, -0.7, 0);
        root.addChild(a);
        const b = makeUiNode('b', 10, 10);
        b.setPosition(-11.26, 4.02, 0);
        root.addChild(b);

        expect(component.snapNow()).toBe(true);
        expect(appliedScale(camera)).toBeCloseTo(2, 6);
        const grid = component.grid!;
        expect(isPixelAligned(grid, a.worldPosition.x, a.worldPosition.y)).toBe(true);
        expect(isPixelAligned(grid, b.worldPosition.x, b.worldPosition.y)).toBe(true);
        // Children inherit the parent's correction: the root itself is on the grid too.
        expect(isPixelAligned(grid, root.worldPosition.x, root.worldPosition.y)).toBe(true);
        expect(component.snapNow()).toBe(false);
    });

    test('a snapped position survives a scale on the parent', () => {
        const { root, component } = layer(1);
        root.setScale(2, 2, 1);
        const child = makeUiNode('scaled', 10, 10);
        child.setPosition(0.27, 0.27, 0);
        root.addChild(child);
        component.snapNow();
        const grid = component.grid!;
        // The parent is snapped first, then the child against it; scales stay authored values.
        expect(isPixelAligned(grid, root.worldPosition.x, root.worldPosition.y)).toBe(true);
        expect(isPixelAligned(grid, child.worldPosition.x, child.worldPosition.y)).toBe(true);
        expect(child.worldPosition.x).not.toBeCloseTo(0.54, 6);
        expect(root.scale.x).toBe(2);
    });

    test('inactive children are skipped', () => {
        const { root, component } = layer(2);
        const child = makeUiNode('off', 10, 10);
        child.setPosition(0.3, 0.3, 0);
        child.active = false;
        root.addChild(child);
        component.snapNow();
        const grid = component.grid!;
        expect(isPixelAligned(grid, child.worldPosition.x, child.worldPosition.y)).toBe(false);
    });

    test('a nested component owns its own subtree', () => {
        const { root, component } = layer(2);
        const inner = makeUiNode('inner', 10, 10);
        const innerCamera = new Node('inner-camera').addComponent(Camera);
        innerCamera.projection = Camera.ProjectionType.ORTHO;
        innerCamera.orthoHeight = screen.windowSize.height / 4;
        innerCamera.orthoWidth = screen.windowSize.width / 4;
        inner.setPosition(0.3, 0.3, 0);
        const nested = inner.addComponent(AirPixelPerfect);
        nested.camera = innerCamera;
        nested.autoSnap = false;
        root.addChild(inner);

        component.snapNow();
        const grid = component.grid!;
        // The outer walk must not snap nodes another enabled component claims.
        expect(isPixelAligned(grid, inner.worldPosition.x, inner.worldPosition.y)).toBe(false);
        expect(innerCamera.orthoHeight).toBeCloseTo(screen.windowSize.height / 4, 6);
    });

    test('a nested layer finds the camera through its parents', () => {
        const canvasRoot = makeUiNode('canvas-root', 200, 200);
        const camera = canvasRoot.addComponent(Camera);
        camera.projection = Camera.ProjectionType.ORTHO;
        camera.orthoHeight = screen.windowSize.height / 4;
        camera.orthoWidth = screen.windowSize.width / 4;
        const bench = makeUiNode('bench', 100, 100);
        bench.setPosition(0.3, 0.3, 0);
        canvasRoot.addChild(bench);

        const nested = bench.addComponent(AirPixelPerfect);
        nested.pixelRatioOverride = 2;
        nested.autoSnap = false;
        expect(nested.snapNow()).toBe(true);
        expect(nested.camera).toBe(camera);
        expect(isPixelAligned(nested.grid!, bench.worldPosition.x, bench.worldPosition.y)).toBe(true);
    });

    test('snapPosition off keeps the layout and still locks the camera', () => {
        const { root, camera, component } = layer(2);
        component.snapPosition = false;
        const child = makeUiNode('kept', 10, 10);
        child.setPosition(0.3, 0.3, 0);
        root.addChild(child);
        component.snapNow();
        expect(appliedScale(camera)).toBeCloseTo(2, 6);
        expect(child.worldPosition.x).toBeCloseTo(0.3, 9);
    });

    test('snapSizes rounds both edges and the extent onto whole pixels', () => {
        const { root, component } = layer(2);
        component.snapSizes = true;
        const box = makeUiNode('box', 20.3, 9.7);
        box.setPosition(0, 0, 0);
        root.addChild(box);
        component.snapNow();
        const transform = box.getComponent(UITransform)!;
        const grid = component.grid!;
        expect(transform.width * 2).toBeCloseTo(Math.round(transform.width * 2), 6);
        expect(transform.height * 2).toBeCloseTo(Math.round(transform.height * 2), 6);
        expect(
            isPixelAligned(
                grid,
                box.worldPosition.x - transform.width * 0.5,
                box.worldPosition.y - transform.height * 0.5,
            ),
        ).toBe(true);
        expect(
            isPixelAligned(
                grid,
                box.worldPosition.x + transform.width * 0.5,
                box.worldPosition.y + transform.height * 0.5,
            ),
        ).toBe(true);
        expect(component.snapNow()).toBe(false);
    });

    test('the camera node is the anchor: an odd frame buffer settles instead of crawling', () => {
        // Regression: rounding the anchor node itself moved it by +0.5 device pixel per frame,
        // because the grid puts it at the viewport centre and an odd centre is never on the lattice.
        const cameraNode = new Node('anchor-camera');
        const camera = cameraNode.addComponent(Camera);
        camera.projection = Camera.ProjectionType.ORTHO;
        const win = screen.windowSize;
        // Guarantee a half-pixel viewport centre whatever parity the harness window has.
        camera.rect.set(
            0,
            0,
            win.width % 2 === 0 ? (win.width - 1) / win.width : 1,
            win.height % 2 === 0 ? (win.height - 1) / win.height : 1,
        );
        camera.orthoWidth = win.width / 2;
        camera.orthoHeight = win.height / 2;
        const component = cameraNode.addComponent(AirPixelPerfect);
        component.camera = camera;
        component.autoSnap = false;
        const child = makeUiNode('content', 10, 10);
        child.setPosition(0.27, 0.27, 0);
        cameraNode.addChild(child);

        expect(component.snapNow()).toBe(true);
        const grid = component.grid!;
        // The anchor sits at the viewport centre: off the pixel lattice whenever that centre is odd.
        expect(
            grid.toPixelX(cameraNode.worldPosition.x) % 1 !== 0 || grid.toPixelY(cameraNode.worldPosition.y) % 1 !== 0,
        ).toBe(true);
        expect(isPixelAligned(grid, child.worldPosition.x, child.worldPosition.y)).toBe(true);
        const anchor = [cameraNode.worldPosition.x, cameraNode.worldPosition.y];
        const origin = [grid.originX, grid.originY];

        for (let i = 0; i < 5; i++) {
            expect(component.snapNow()).toBe(false);
        }
        expect([cameraNode.worldPosition.x, cameraNode.worldPosition.y]).toEqual(anchor);
        expect([component.grid!.originX, component.grid!.originY]).toEqual(origin);
    });

    test('a Canvas node drives the camera node, so it is an anchor as well', () => {
        // Regression for the real wiring: the layer component sits on the Canvas node, whose world
        // position Canvas._onResizeCamera copies into the camera node on every resize. Snapping it
        // shifted the grid that had just been built from it, so each frame rounded a fresh half
        // pixel and the whole layer crept by +0.5 device pixel — visible at 721x509, not at even sizes.
        const root = makeUiNode('crawl-canvas', 100, 100);
        const canvas = root.addComponent(Canvas);
        const cameraNode = new Node('crawl-camera');
        const camera = cameraNode.addComponent(Camera);
        camera.projection = Camera.ProjectionType.ORTHO;
        root.addChild(cameraNode);
        canvas.cameraComponent = camera;
        activate(root);

        const win = screen.windowSize;
        camera.rect.set(
            0,
            0,
            win.width % 2 === 0 ? (win.width - 1) / win.width : 1,
            win.height % 2 === 0 ? (win.height - 1) / win.height : 1,
        );
        camera.orthoWidth = win.width / 2;
        camera.orthoHeight = win.height / 2;

        root.setPosition(0.31, 0.17, 0);
        const component = root.addComponent(AirPixelPerfect);
        component.pixelRatioOverride = 1;
        component.autoSnap = false;
        const plate = makeUiNode('plate', 10, 10);
        plate.setPosition(0.27, -0.23, 0);
        root.addChild(plate);

        expect(component.snapNow()).toBe(true);
        const grid = component.grid!;
        expect(grid.toPixelX(root.worldPosition.x) % 1 !== 0 || grid.toPixelY(root.worldPosition.y) % 1 !== 0).toBe(
            true,
        );
        expect(isPixelAligned(grid, plate.worldPosition.x, plate.worldPosition.y)).toBe(true);

        const canvasPos = [root.worldPosition.x, root.worldPosition.y];
        const cameraZ = cameraNode.worldPosition.z;
        const origin = [grid.originX, grid.originY];

        for (let i = 0; i < 5; i++) {
            // Emulate the engine re-copying the canvas position into the camera node between frames.
            cameraNode.setWorldPosition(canvasPos[0], canvasPos[1], cameraZ);
            expect(component.snapNow()).toBe(false);
        }
        expect([root.worldPosition.x, root.worldPosition.y]).toEqual(canvasPos);
        expect([component.grid!.originX, component.grid!.originY]).toEqual(origin);
    });

    test('roundToPixel reports the grid it just built', () => {
        const { component } = layer(2);
        expect(component.snapNow()).toBe(true);
        const grid = component.grid!;
        const snapped = component.roundToPixel(0.3, 0.3, 7);
        expect(isPixelAligned(grid, snapped.x, snapped.y)).toBe(true);
        // Never farther than half a device pixel from the input.
        expect(Math.abs(grid.toPixelX(snapped.x) - grid.toPixelX(0.3))).toBeLessThanOrEqual(0.5 + 1e-9);
        expect(snapped.z).toBe(7);
    });

    test('enable and disable bind the BEFORE_DRAW hook', () => {
        const { root, component } = layer(2);
        component.autoSnap = true;
        activate(root);
        const child = makeUiNode('live', 10, 10);
        child.setPosition(0.3, 0.3, 0);
        root.addChild(child);

        director.emit(DirectorEvent.BEFORE_DRAW);
        const grid = component.grid!;
        expect(isPixelAligned(grid, child.worldPosition.x, child.worldPosition.y)).toBe(true);

        component.enabled = false;
        child.setPosition(0.3, 0.3, 0);
        director.emit(DirectorEvent.BEFORE_DRAW);
        expect(isPixelAligned(grid, child.worldPosition.x, child.worldPosition.y)).toBe(false);
        expect(child.worldPosition.x).toBeCloseTo(root.worldPosition.x + 0.3, 9);

        component.enabled = true;
        director.emit(DirectorEvent.BEFORE_DRAW);
        expect(isPixelAligned(component.grid!, child.worldPosition.x, child.worldPosition.y)).toBe(true);
    });

    test('a nested layer must snap after its parent layer, not before', () => {
        // Documented ordering dependency: the outer pass corrects the parent by a sub-pixel,
        // and a nested layer that already snapped inherits that shift.
        const { root, component: outer } = layer(1);
        root.setPosition(0.37, 0, 0);
        const inner = makeUiNode('inner', 10, 10);
        inner.setPosition(0.26, 0, 0);
        root.addChild(inner);
        const nested = inner.addComponent(AirPixelPerfect);
        nested.camera = outer.camera;
        nested.pixelRatioOverride = 1;
        nested.autoSnap = false;

        nested.snapNow();
        outer.snapNow();
        expect(isPixelAligned(nested.grid!, inner.worldPosition.x, inner.worldPosition.y)).toBe(false);

        nested.snapNow();
        expect(isPixelAligned(nested.grid!, inner.worldPosition.x, inner.worldPosition.y)).toBe(true);
    });

    test('an integer camera scale survives repeated frames without churn', () => {
        const { root, camera, component } = layer(3);
        const child = makeUiNode('tween', 10, 10);
        root.addChild(child);
        component.snapNow();
        for (let i = 1; i <= 20; i++) {
            child.setPosition(i / 7, -i / 11, 0);
            expect(component.snapNow()).toBe(true);
            expect(isPixelAligned(component.grid!, child.worldPosition.x, child.worldPosition.y)).toBe(true);
        }
        expect(component.snapNow()).toBe(false);
        expect(appliedScale(camera)).toBeCloseTo(3, 6);
    });
});
