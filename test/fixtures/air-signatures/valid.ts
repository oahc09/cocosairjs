import { Scene, Node, Camera, MeshRenderer, primitives, utils } from '../../../src';

const scene = new Scene('Main');
const node = new Node('Renderable');
scene.addChild(node);
node.addComponent(Camera);
node.addComponent(MeshRenderer).mesh = utils.createMesh(primitives.box({ width: 2 }));
const bounds = node.getComponent(MeshRenderer)?.mesh?.struct;
void bounds;

// Local classes with similar names are not native API misuse.
class LocalScene { addComponent() { return 1; } addChild() { return 2; } }
const local = new LocalScene();
const result = local.addChild();
local.addComponent();
void result;
