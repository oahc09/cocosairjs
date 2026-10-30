// Real engine UI components; the host collector verifies text and sprite pixels in separate PNG regions.
export async function buildUiScenario(air, { id, scene, cameraNode }) {
    if (id !== 'ui') throw new Error('UI scenario requires id=ui');
    const {
        Node,
        Camera,
        Canvas,
        UITransform,
        Layers,
        Color,
        Label,
        Sprite,
        ImageAsset,
        Texture2D,
        SpriteFrame,
        view,
        ResolutionPolicy,
    } = air;
    cameraNode.active = false;
    view.setDesignResolutionSize(320, 240, ResolutionPolicy.EXACT_FIT);
    const layer = Layers.Enum.UI_3D;
    const tracked = [];
    const track = (name, asset) => {
        if (asset && !tracked.some((entry) => entry.asset === asset)) tracked.push({ name, asset });
    };
    const uiNode = (name, parent, width, height, x = 0, y = 0) => {
        const node = new Node(name);
        node.layer = layer;
        node.addComponent(UITransform).setContentSize(width, height);
        node.setPosition(x, y, 0);
        parent.addChild(node);
        return node;
    };
    const canvasNode = uiNode('Interop Canvas', scene, 320, 240, 160, 120);
    track('ui-canvas-node', canvasNode);
    const canvasComponent = canvasNode.addComponent(Canvas);
    const uiCameraNode = uiNode('UI Camera', canvasNode, 1, 1);
    const uiCamera = uiCameraNode.addComponent(Camera);
    uiCamera.projection = Camera.ProjectionType.ORTHO;
    uiCamera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    uiCamera.clearColor = new Color(20, 40, 80, 255);
    uiCamera.visibility = layer;
    uiCamera.near = 1;
    uiCamera.far = 2000;
    canvasComponent.cameraComponent = uiCamera;

    const pixels = document.createElement('canvas');
    pixels.width = pixels.height = 16;
    const context = pixels.getContext('2d');
    if (!context) throw new Error('UI sprite requires a real Canvas 2D context');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 16, 16);
    const image = new ImageAsset(pixels);
    const texture = new Texture2D();
    texture.image = image;
    const frame = new SpriteFrame();
    frame.texture = texture;
    track('sprite-frame', frame);
    track('sprite-texture', texture);
    track('sprite-image', image);
    const spriteNode = uiNode('Color Sprite', canvasNode, 160, 56, 0, -45);
    const sprite = spriteNode.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
    sprite.color = new Color(40, 100, 220, 255);

    const labelNode = uiNode('Text Label', canvasNode, 260, 56, 0, 55);
    const label = labelNode.addComponent(Label);
    label.useSystemFont = true;
    label.fontFamily = 'Arial';
    label.fontSize = 28;
    label.lineHeight = 36;
    label.color = Color.WHITE;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.CLAMP;
    label.enableWrapText = false;
    label.cacheMode = Label.CacheMode.NONE;
    label.string = 'AIR UI 123';

    const rgba = (color) => [color.r, color.g, color.b, color.a];
    return {
        initialSteps: 3,
        advanceSteps: 3,
        inspect() {
            const labelFrame = label.spriteFrame;
            track('label-frame', labelFrame);
            track('label-texture', labelFrame?.texture);
            track('label-image', labelFrame?.texture?.image);
            return {
                label: {
                    text: label.string,
                    color: rgba(label.color),
                    vertices: label.renderData?.vertexCount ?? 0,
                    textureWidth: labelFrame?.texture?.width ?? 0,
                    textureHeight: labelFrame?.texture?.height ?? 0,
                },
                sprite: { color: rgba(sprite.color), width: spriteNode.getComponent(UITransform).width },
                // Screen coordinates, origin at the top left; neither region overlaps the other component.
                pixelRegions: {
                    label: { x: 30, y: 28, width: 260, height: 72 },
                    sprite: { x: 80, y: 137, width: 160, height: 56 },
                },
            };
        },
        advance() {
            label.string = 'GPU UI 987';
            sprite.color = new Color(230, 70, 40, 255);
        },
        verify(before, after) {
            if (before.label.text !== 'AIR UI 123' || after.label.text !== 'GPU UI 987')
                throw new Error('Label text state did not advance');
            if (before.sprite.color.join(',') !== '40,100,220,255' || after.sprite.color.join(',') !== '230,70,40,255')
                throw new Error('Sprite color state did not advance');
            for (const state of [before, after])
                if (state.label.vertices <= 0 || state.label.textureWidth <= 0 || state.label.textureHeight <= 0)
                    throw new Error('Label has no real render data or text texture');
        },
        async dispose() {
            const failures = [];
            // Label owns its generated text texture; destroying its node uses the engine's normal cleanup.
            for (const asset of [canvasNode, frame, texture, image]) {
                try {
                    if (asset.isValid) asset.destroy();
                } catch (error) {
                    failures.push(String(error?.stack || error));
                }
            }
            if (failures.length) throw new Error(failures.join('\n'));
        },
        resources: () => tracked.map(({ name, asset }) => ({ name, valid: asset.isValid })),
    };
}
