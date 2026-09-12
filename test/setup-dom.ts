// 在引擎模块加载前预置官方模板 DOM（pal/screen-adapter 为模块顶层单例）
if (typeof document !== 'undefined' && !document.getElementById('GameCanvas')) {
    document.body.innerHTML = '<div id="GameDiv"><div id="Cocos3dGameContainer"><canvas id="GameCanvas"></canvas></div></div>';
}

import '../src/exports/gfx-empty'; // 注册 EmptyDevice（HEADLESS 渲染模式）

export {};
