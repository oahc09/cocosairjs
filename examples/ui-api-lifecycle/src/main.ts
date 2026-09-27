/**
 * ui-api-lifecycle — Component lifecycle and Widget editor accessors.
 *
 * A visible UI label is anchored by Widget; disposable off-screen probe nodes
 * exercise Widget/UIRenderer/Sprite/Label lifecycle APIs without changing it.
 */
import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Canvas,
    UITransform,
    Widget,
    UIRenderer,
    Label,
    Sprite,
    Layers,
    Color,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
const scene = new Scene('ui-api-lifecycle');
const canvasNode = new Node('Canvas');
const canvasTransform = canvasNode.addComponent(UITransform);
canvasTransform.setContentSize(480, 360);
const canvas = canvasNode.addComponent(Canvas);
scene.addChild(canvasNode);

const cameraNode = new Node('UICamera');
canvasNode.addChild(cameraNode);
cameraNode.setPosition(0, 0, 1000);
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.ORTHO;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 22, 34, 255);
camera.visibility = Layers.Enum.UI_3D;
canvas.cameraComponent = camera;

const titleNode = new Node('TitleLabel');
canvasNode.addChild(titleNode);
const titleTransform = titleNode.addComponent(UITransform);
titleTransform.setContentSize(400, 56);
const title = titleNode.addComponent(Label);
title.string = 'Widget and UI lifecycle';
title.fontSize = 24;
title.color = new Color(120, 210, 250, 255);
title.horizontalAlign = Label.HorizontalAlign.CENTER;
title.verticalAlign = Label.VerticalAlign.CENTER;

const titleWidget = titleNode.addComponent(Widget);
titleWidget.isAlignLeft = true;
titleWidget.isAlignRight = true;
titleWidget.isAlignTop = true;
titleWidget.left = 24;
titleWidget.right = 24;
titleWidget.top = 28;
titleWidget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;

const hooks = {
    widgetEnable: 0,
    widgetDisable: 0,
    widgetDestroy: 0,
    rendererDestroy: 0,
    spriteDestroy: 0,
    labelDestroy: 0,
};
class WidgetLifecycleProbe extends Widget {
    onEnable() {
        super.onEnable();
        hooks.widgetEnable++;
    }
    onDisable() {
        super.onDisable();
        hooks.widgetDisable++;
    }
    onDestroy() {
        super.onDestroy();
        hooks.widgetDestroy++;
    }
}
class UIRendererLifecycleProbe extends UIRenderer {
    onDestroy() {
        super.onDestroy();
        hooks.rendererDestroy++;
    }
}
class SpriteLifecycleProbe extends Sprite {
    onDestroy() {
        super.onDestroy();
        hooks.spriteDestroy++;
    }
}
class LabelLifecycleProbe extends Label {
    onDestroy() {
        super.onDestroy();
        hooks.labelDestroy++;
    }
}

const probeNode = (name: string): Node => {
    const node = new Node(name);
    canvasNode.addChild(node);
    node.addComponent(UITransform).setContentSize(1, 1);
    node.setPosition(10000, 10000, 0);
    return node;
};

const editorValues = [
    titleWidget.editorTop,
    titleWidget.editorBottom,
    titleWidget.editorLeft,
    titleWidget.editorRight,
    titleWidget.editorHorizontalCenter,
    titleWidget.editorVerticalCenter,
];
let apiNodes: {
    widgetNode: Node;
    rendererNode: Node;
    spriteNode: Node;
    labelNode: Node;
    rendererConstructorName: string;
};
function buildApiNodes(): typeof apiNodes {
    const widgetNode = probeNode('WidgetLifecycleProbe');
    const widget = widgetNode.addComponent(WidgetLifecycleProbe);
    widget.isAlignTop = true;
    widget.editorTop = 0;
    widget.enabled = false;
    widget.enabled = true;

    const rendererNode = probeNode('UIRendererLifecycleProbe');
    const renderer = rendererNode.addComponent(UIRendererLifecycleProbe);
    const rendererConstructorName = renderer.constructor.name;
    renderer.onRestore();
    renderer.destroyRenderData();

    const spriteNode = probeNode('SpriteLifecycleProbe');
    spriteNode.addComponent(SpriteLifecycleProbe);
    const labelNode = probeNode('LabelLifecycleProbe');
    labelNode.addComponent(LabelLifecycleProbe).string = '';
    return { widgetNode, rendererNode, spriteNode, labelNode, rendererConstructorName };
}

const apiState = {
    alignMode: titleWidget.alignMode === Widget.AlignMode.ON_WINDOW_RESIZE,
    editorValuesFinite: editorValues.every(Number.isFinite),
};
app.run(scene);
apiNodes = buildApiNodes();

(window as any).__trialProbe = {
    id: 'ui-api-lifecycle',
    ready: false,
    ok: true,
    checks: [] as unknown[],
    apiState,
    hooks,
};
(window as any).__probe = async () => ({ apiState, hooks, editorValues });
const ownedApiNodes = () => [
    { name: 'WidgetLifecycleProbe', ref: apiNodes.widgetNode },
    { name: 'UIRendererLifecycleProbe', ref: apiNodes.rendererNode },
    { name: 'SpriteLifecycleProbe', ref: apiNodes.spriteNode },
    { name: 'LabelLifecycleProbe', ref: apiNodes.labelNode },
];
installAssetLifecycle({
    label: 'ui-api-lifecycle',
    hold: ownedApiNodes,
    release: () => {
        for (const entry of ownedApiNodes()) entry.ref.destroy();
    },
    reacquire: async () => {
        apiNodes = buildApiNodes();
        return ownedApiNodes();
    },
});

requestAnimationFrame(() =>
    requestAnimationFrame(() => {
        const probe = (window as any).__trialProbe;
        probe.checks = [
            { name: 'widget-editor-values', ok: apiState.editorValuesFinite, detail: editorValues.join(',') },
            { name: 'widget-align-mode', ok: apiState.alignMode },
            { name: 'ui-renderer-constructor', ok: apiNodes.rendererConstructorName === 'UIRendererLifecycleProbe' },
        ];
        probe.ok = probe.checks.every((entry: any) => entry.ok);
        probe.ready = true;
    }),
);

console.log('[ui-api-lifecycle] running');
