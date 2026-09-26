/**
 * Cocos AIR — starter（最小 Code First 启动）
 *
 * 单一教学目标：createAirApp → Scene → app.run 跑通，并由引擎真正产出一帧画面。
 * 画面只有一片清屏色（无任何几何体）——刻意如此：本页要证明"看到的东西来自
 * GPU 帧缓冲（引擎在画）"，而不是 DOM/CSS 背景冒充。因此 body 背景保持白色 #fff，
 * 引擎 clearColor 为 (20,60,120)：若引擎未启动，画布是白的；启动后是蓝的。
 *
 * 注意：引擎 bundle 导入时（模块级 sys 单例）ScreenAdapter 按 id 'GameCanvas'
 * 查找画布，因此 HTML 中 canvas id 必须为 'GameCanvas'（与官方 Web 模板一致）。
 */

import { createAirApp, Scene, Node, Camera, Layers, Color } from 'cocosair';

const app = await createAirApp({
    canvas: '#GameCanvas',
});

const scene = new Scene('Main');

// 最小可见前提：一个相机决定清屏色与投影（无 Camera 时引擎不会绘制任何内容）
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.ORTHO;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(20, 60, 120, 255);
camera.visibility = Layers.Enum.DEFAULT;
camera.priority = 0;

app.run(scene);

window.__airApp = app; // 开发面板/agent session 显式绑定入口（V0.5.1 T5）

const running = app.getScene();
console.log('[starter] running — minimal Code First scene; app.getScene() =', running && running.name);
