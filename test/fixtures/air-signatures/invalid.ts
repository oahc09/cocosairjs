import { Scene, Node, Camera, MeshRenderer, primitives } from '../../../src';

const scene = new Scene('Main');
scene.addComponent(Camera);
const child = scene.addChild(new Node('Child'));
child.setPosition(0, 0, 0);
new Node('Mesh').addComponent(MeshRenderer).mesh = primitives.box();
primitives.sphere({ radius: 1 });
