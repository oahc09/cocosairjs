/**
 * Cocos AIR — starter（V0.2 Task 12 / 计划书 §21）
 *
 * V0.2 最核心的入门模板：最小 Code First 场景。
 * 演示：canvas selector 字符串 + createAirApp + 空 Scene 运行。
 *
 * 注意：引擎 bundle 导入时（模块级 sys 单例）ScreenAdapter 按 id 'GameCanvas'
 * 查找画布，因此 HTML 中 canvas id 必须为 'GameCanvas'（与官方 Web 模板一致）。
 */

import {
    createAirApp,
    Scene,
} from 'cocosair';

const app = await createAirApp({
    canvas: '#GameCanvas',
});

const scene = new Scene('Main');

app.run(scene);

console.log('[starter] running — minimal Code First scene; app.getScene() =', app.getScene()?.name);
