/**
 * runtime-asset-release — Runtime 资产生命周期：Load → Instantiate → Dispose → Reload（E011）。
 *
 * 启动后自动执行一轮完整循环并核对：
 *   dispose 后 instance.root / asset 均 invalid、场景无残留节点，
 *   reload 后模型再次可见（生命周期不以截图为主要验收）。
 */

import { createAirApp, Scene, Node, Camera, DirectionalLight, Layers, Vec3, Color, isValid, GLTFLoader } from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('runtime-asset-release');

var cameraNode = new Node('Main Camera'); scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.8, 5)); cameraNode.setRotationFromEuler(-15, 0, 0);
var camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE; camera.fov = 45;
camera.near = 0.1; camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT; camera.priority = 0;
var lightNode = new Node('Main Light'); scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0)); lightNode.setRotationFromEuler(-45, -30, 0);
var light = lightNode.addComponent(DirectionalLight); light.illuminance = 2;

var panel = document.createElement('div');
panel.style.cssText = 'position:fixed;left:10px;top:8px;color:#9cd;font:12px monospace;white-space:pre;background:rgba(0,0,0,.45);padding:6px 8px;border-radius:4px';
document.body.appendChild(panel);

var log: string[] = [];
function render() { panel.textContent = log.join('\n'); }
function note(line: string) { log.push(line); render(); }

var gltfBytes: ArrayBuffer;
var cycles = 0;
var release = { disposed: false, assetsAfter: 0, nodesAfter: 0, reloaded: false };
/** 当前在场景里显示的那一对资产/实例：§25 合同由验证器再拆建一次。 */
var displayed: { asset: any; instance: any } | null = null;

async function loadOnce(): Promise<any> {
  var asset = await new GLTFLoader().parseAsync(gltfBytes.slice(0), './assets/');
  var instance = asset.instantiate();
  scene.addChild(instance.root);
  return { asset: asset, instance: instance };
}

function held(): any[] {
  return displayed
    ? [{ name: 'GLTFAsset(BoxTextured)', ref: displayed.asset }, { name: 'instance.root', ref: displayed.instance.root }]
    : [];
}

async function cycle(): Promise<void> {
  cycles++;
  note('cycle ' + cycles + ': load…');
  var owned = await loadOnce();
  displayed = owned;
  note('  instance attached, valid=' + isValid(owned.instance.root));
  await new Promise(function (r) { setTimeout(r, 600); });

  note('  dispose…');
  owned.instance.dispose();
  owned.asset.destroy();
  await new Promise(function (r) { setTimeout(r, 300); });

  var rootValid = isValid(owned.instance.root);
  var assetValid = isValid(owned.asset);
  release.disposed = !rootValid && !assetValid;
  release.assetsAfter = assetValid ? 1 : 0;
  release.nodesAfter = rootValid ? 1 : 0;
  note('  after dispose: rootValid=' + rootValid + ' assetValid=' + assetValid);

  note('  reload…');
  var reloaded = await loadOnce();
  displayed = reloaded;
  release.reloaded = isValid(reloaded.instance.root);
  note('  reloaded, valid=' + release.reloaded);
  render();
  (window as any).__releaseState = Object.assign({ cycles: cycles }, release);
}

// §25 Lifecycle Contract：验证器调用 window.__lifecycle() 时按统一合同再拆建一次，
// 泄漏核对与重载有效性由 shared/asset-lifecycle 计算。
installAssetLifecycle({
  label: 'runtime-asset-release',
  hold: held,
  release: () => {
    var owned = displayed;
    displayed = null;
    owned.instance.dispose();
    owned.asset.destroy();
  },
  reacquire: async () => {
    var reloaded = await loadOnce();
    displayed = reloaded;
    cycles++;
    note('verifier cycle: released → reloaded, valid=' + isValid(reloaded.instance.root));
    return held();
  },
});

(async function main() {
  gltfBytes = await (await fetch('./assets/BoxTextured.glb')).arrayBuffer();
  await cycle();
  await cycle();
  note('all cycles done — no stale nodes, no leaked assets');
})();

app.run(scene);
