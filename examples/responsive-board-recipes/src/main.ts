import { createBoardModel } from '../model.js';
import { pickBoardCell, createVisualGate } from '../../../tools/recipes/board-state.js';

const query = new URLSearchParams(location.search);
const legacy = query.has('legacy');
const canvasSelector = query.has('safe') ? '#custom-board' : '#GameCanvas';
const options = {
    canvas: canvasSelector,
    pixelRatioCap: Number(query.get('cap') ?? 2),
    ...(legacy || query.has('default')
        ? {}
        : query.has('window')
          ? { screenMode: 'window' }
          : { screenMode: 'container', container: '#host' }),
    designResolution: { width: 720, height: 720, policy: 0 },
};
let cc: any, app: any;
if (query.has('safe')) {
    const safe = await import('/build/cocosair.module.js');
    app = await safe.createAirApp(options);
    cc = await import('cocosair');
} else {
    cc = await import(legacy ? '/output/responsive-host/baseline/cocosair.module.js' : 'cocosair');
    if (legacy) cc.settings.overrideSettings('screen', 'exactFitScreen', false);
    app = await cc.createAirApp(options);
}
(window as unknown as Record<string, unknown>).__airApp = app;
const scene = new cc.Scene('ResponsiveBoards');
const ui = cc.createUICanvas(scene, 'UI', { designWidth: 720, designHeight: 720 });
const group = new cc.Node('TranslatedScaledGroup');
group.layer = cc.Layers.Enum.UI_2D;
group.setPosition(40, -20, 0);
group.setScale(1.25, 0.8, 1);
ui.addChild(group);
const board = new cc.Node('Board');
board.layer = cc.Layers.Enum.UI_2D;
group.addChild(board);
board.setPosition(-32, 25, 0);
board.setScale(0.8, 1.25, 1);
board.addComponent(cc.UITransform).setContentSize(480, 480);
const graphics = board.addComponent(cc.Graphics);
const model = createBoardModel(),
    visual = createVisualGate();
const status = cc
    .labelNode(ui, 'hits 0', 'Status', {
        fontSize: 24,
        position: [0, 300],
        boxSize: [440, 40],
        overflow: cc.Label.Overflow.SHRINK,
        enableWrapText: false,
    })
    .getComponent(cc.Label);
cc.labelNode(ui, 'RIGHT', 'SingleRight', {
    fontSize: 18,
    position: [300, 275],
    boxSize: [64, 80],
    overflow: cc.Label.Overflow.SHRINK,
    enableWrapText: false,
});
const long = cc
    .labelNode(ui, 'RESTART', 'SingleLong', {
        fontSize: 18,
        position: [300, 160],
        boxSize: [64, 80],
        overflow: cc.Label.Overflow.SHRINK,
        enableWrapText: false,
    })
    .getComponent(cc.Label);
cc.labelNode(ui, '多行说明\n保留折行', 'MultiText', {
    fontSize: 18,
    position: [-300, 280],
    boxSize: [100, 90],
    overflow: cc.Label.Overflow.SHRINK,
    enableWrapText: true,
});
const actions = cc.createActionState({
    actions: {
        drop: {
            sources: [
                { backend: 'native', keyCode: cc.KeyCode.SPACE },
                { backend: 'native', keyCode: cc.KeyCode.DIGIT_2 },
                { backend: 'native', keyCode: cc.KeyCode.DIGIT_9 },
            ],
        },
    },
});
const adapter = cc.createActionInput({ state: actions, backend: 'native', canvas: app.canvas });
adapter.attach();
let drops = 0,
    flags = 0,
    hover = 0;
const keyboard = { down: 0, pressing: 0, up: 0 };
const down = () => keyboard.down++,
    pressing = () => keyboard.pressing++,
    up = () => keyboard.up++;
cc.input.on(cc.Input.EventType.KEY_DOWN, down);
cc.input.on(cc.Input.EventType.KEY_PRESSING, pressing);
cc.input.on(cc.Input.EventType.KEY_UP, up);
function render(): void {
    const s = model.snapshot(),
        visiblePulse = Math.ceil(s.pulse * 30);
    visual.draw(
        JSON.stringify({
            columns: s.columns,
            rows: s.rows,
            hits: s.hits,
            selected: s.selected,
            visiblePulse,
            paused: s.paused,
            drops,
            flags,
        }),
        () => {
            graphics.clear();
            const w = 480 / s.columns,
                h = 480 / s.rows;
            for (let row = 0; row < s.rows; row++)
                for (let column = 0; column < s.columns; column++) {
                    const selected = row * s.columns + column === s.selected;
                    graphics.fillColor = selected
                        ? new cc.Color(45 + visiblePulse * 15, 185, 110, 255)
                        : new cc.Color(35, 61, 89, 255);
                    graphics.rect(-240 + column * w + 1, 240 - (row + 1) * h + 1, w - 2, h - 2);
                    graphics.fill();
                }
            status.string = `hits ${s.hits} · drops ${drops} · flags ${flags}${s.paused ? ' · paused' : ''}`;
        },
    );
}
function pick(event: any): void {
    const p = event.getUILocation(),
        local = board.getComponent(cc.UITransform).convertToNodeSpaceAR(new cc.Vec3(p.x, p.y, 0));
    const s = model.snapshot(),
        cell = pickBoardCell(local, 480, 480, s.columns, s.rows);
    if (cell) model.pick(cell.row, cell.column);
    render();
}
// One primary click family, including native synthesized mouse touches. Mouse is hover only.
const onHover = (event: any) => {
    if (event.getButton() === cc.EventMouse.BUTTON_MISSING) hover++;
};
cc.input.on(cc.Input.EventType.TOUCH_START, pick);
cc.input.on(cc.Input.EventType.MOUSE_MOVE, onHover);
app.session.own(() => {
    adapter.dispose();
    cc.input.off(cc.Input.EventType.TOUCH_START, pick);
    cc.input.off(cc.Input.EventType.MOUSE_MOVE, onHover);
    cc.input.off(cc.Input.EventType.KEY_DOWN, down);
    cc.input.off(cc.Input.EventType.KEY_PRESSING, pressing);
    cc.input.off(cc.Input.EventType.KEY_UP, up);
}, 'board-input');
class Driver extends cc.Component {
    update(dt: number): void {
        const tick = actions.consumeTick();
        if (!model.snapshot().paused)
            drops += tick.transitions.filter((t: any) => t.action === 'drop' && t.kind === 'press').length;
        model.tick(dt);
        render();
    }
}
const driver = new cc.Node('Driver');
scene.addChild(driver);
driver.addComponent(Driver);
app.run(scene);
render();
function restart(columns?: number, rows?: number): void {
    model.reset(columns, rows);
    drops = 0;
    flags = 0;
    adapter.reset('restart');
    visual.invalidate();
    render();
}
function pause(value: boolean): void {
    model.pause(value);
    adapter.reset('pause');
    render();
}
function listen(selector: string, type: string, listener: EventListener): void {
    const element = document.querySelector(selector)!;
    element.addEventListener(type, listener);
    app.session.own(() => element.removeEventListener(type, listener), `board-dom:${selector}`);
}
listen('#restart', 'click', () => restart());
listen('#pause', 'click', () => pause(!model.snapshot().paused));
listen('#flag', 'click', () => {
    flags++;
    render();
});
listen('#board', 'change', (event) => {
    const [columns, rows] = (event.target as HTMLSelectElement).value.split(',').map(Number);
    restart(columns, rows);
});
const clock = cc.createStepClock();
if (query.has('test')) {
    clock.begin();
    await clock.step(0);
    (window as any).__boardProbe = {
        snapshot: () => ({
            ...model.snapshot(),
            drops,
            flags,
            hover,
            keyboard: { ...keyboard },
            held: actions.held('drop'),
            adapterAttached: adapter.attached,
            draws: visual.draws,
            nodes: ui.children?.length ?? 0,
            uiValid: ui.isValid,
            buffer: [app.canvas.width, app.canvas.height],
            dpr: cc.screen.devicePixelRatio,
            viewScale: [cc.view.getScaleX(), cc.view.getScaleY()],
            context: app.contextHealth.snapshot(),
        }),
        frame: (dt = 0) => clock.step(dt),
        restart,
        pause,
        fixture: (value: any) => {
            model.fixture(value);
            render();
        },
        label: (text: string, width: number) => {
            long.string = text;
            long.node.getComponent(cc.UITransform).setContentSize(width, 80);
        },
        legacyWorkaround: () => {
            const frame = document.getElementById('GameDiv')!;
            cc.screen.windowSize = new cc.Size(
                Math.round(frame.clientWidth * cc.screen.devicePixelRatio),
                Math.round(frame.clientHeight * cc.screen.devicePixelRatio),
            );
        },
        close: () => app.close(),
    };
}
window.addEventListener(
    'pagehide',
    () => {
        adapter.dispose();
        void app.close();
    },
    { once: true },
);
