// 必须独立于任何引擎 import：先设置 DOM + stub canvas，再让引擎模块加载
if (typeof document !== 'undefined' && !document.getElementById('GameCanvas')) {
    document.body.innerHTML = '<div id="GameDiv"><div id="Cocos3dGameContainer"><canvas id="GameCanvas"></canvas></div></div>';
}
// jsdom 未实现 canvas：返回 null（HEADLESS 模式下引擎不依赖真实 GL）
HTMLCanvasElement.prototype.getContext = function () { return null; };
HTMLCanvasElement.prototype.toDataURL = function () { return ''; };
