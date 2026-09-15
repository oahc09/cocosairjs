/**
 * Cocos AIR — Minimal Debug Panel（V0.5.1 T5，计划书 §7）。
 *
 * 显式启用的开发面板：Scene Tree、选中 Node 只读详情、Asset 清单与诊断、
 * 错误列表、canvas 截图入口、性能摘要。所有数据/操作都经 T3/T4 的同一
 * AgentSession（本面板不另写引擎访问路径）；第一版不做通用属性编辑器。
 *
 * 启用方式（默认关闭）：dev 页面点击右下角 🛢 按钮或 import('/__debug/panel.js')。
 * 面板要求页面显式暴露 `window.__airApp`（不猜测隐藏引擎状态）。
 *
 * 边界：
 *  - 面板内部异常只显示在面板内，不中断业务主循环；
 *  - 关闭面板：移除 DOM、停止定时器与 rAF、关闭自有 session，无残留监听器；
 *  - 窄屏可用（宽度受限、可折叠分区），键盘可用（Alt+D 开关、Esc 关闭）。
 */

import { createAgentSession } from './agent-session';
import type { AgentSessionImpl, SceneSummary, NodeSummary, RuntimeErrorMessage } from './agent-session';
import type { AirApp } from 'cocosair';

declare global {
    interface Window {
        __airApp?: AirApp;
        __glStats?: { draws: number; shaderErrs: string[]; linkErrs: string[]; counts: Record<string, number> };
    }
}

export interface DebugPanelHandle {
    readonly session: AgentSessionImpl;
    close (): void;
}

interface PanelRefs {
    root: HTMLDivElement;
    treeEl: HTMLDivElement;
    detailEl: HTMLDivElement;
    assetEl: HTMLDivElement;
    errorEl: HTMLDivElement;
    perfEl: HTMLDivElement;
    captureEl: HTMLDivElement;
    statusEl: HTMLDivElement;
}

const CSS = `
  position:fixed; top:8px; right:8px; bottom:8px; width:min(360px, 42vw); z-index:99998;
  background:rgba(12,14,24,.94); color:#cde; font:12px/1.45 ui-monospace,Consolas,monospace;
  border:1px solid #334; border-radius:10px; display:flex; flex-direction:column; overflow:hidden;
  box-shadow:0 4px 24px rgba(0,0,0,.5);
`;
const SECTION_CSS = `
  border-top:1px solid #263; padding:6px 8px; overflow:auto; min-height:34px; max-height:32%;
`;
const BTN_CSS = `
  background:#1c2b4a; color:#9cf; border:1px solid #345; border-radius:6px;
  padding:2px 8px; font:inherit; cursor:pointer;
`;

function el (tag: string, css?: string, text?: string): HTMLElement {
    const node = document.createElement(tag);
    if (css) { node.style.cssText = css; }
    if (text !== undefined) { node.textContent = text; }
    return node;
}

/** 面板主入口：显式 attach（可重复调用生成多个面板；每个面板独立 session）。 */
export function createDebugPanel (options: { app?: AirApp; writableScenes?: never[] } = {}): DebugPanelHandle {
    const app = options.app ?? window.__airApp;
    const root = el('div', CSS);
    root.setAttribute('data-air-debug-panel', 'true');

    // ---- 头部 ----
    const header = el('div', 'display:flex;gap:6px;align-items:center;padding:6px 8px;flex:none');
    header.appendChild(el('b', 'color:#fff', 'cocosair debug'));
    const refreshBtn = el('button', BTN_CSS, '刷新') as HTMLButtonElement;
    const captureBtn = el('button', BTN_CSS, '截图') as HTMLButtonElement;
    const closeBtn = el('button', BTN_CSS, '关闭') as HTMLButtonElement;
    header.append(refreshBtn, captureBtn, closeBtn);
    const statusEl = el('div', 'flex:none;padding:0 8px 4px;color:#89a');
    root.append(header, statusEl);

    // ---- 分区 ----
    const section = (title: string): { wrap: HTMLElement; body: HTMLElement } => {
        const wrap = el('div', SECTION_CSS);
        wrap.appendChild(el('div', 'color:#7eb8ff;margin-bottom:3px;flex:none', title));
        const body = el('div');
        wrap.appendChild(body);
        root.appendChild(wrap);
        return { wrap, body };
    };
    const tree = section('Scene Tree（点击节点查看只读详情）');
    const detail = section('Node 详情');
    const asset = section('Asset 清单与诊断');
    const error = section('运行错误');
    const perf = section('性能摘要');
    const capture = section('截图');
    const refs: PanelRefs = {
        root, treeEl: tree.body, detailEl: detail.body, assetEl: asset.body,
        errorEl: error.body, perfEl: perf.body, captureEl: capture.body, statusEl,
    };
    const { treeEl, detailEl, assetEl, errorEl, perfEl, captureEl } = refs;
    document.body.appendChild(root);

    if (!app) {
        statusEl.textContent = '未找到 app：页面需显式暴露 window.__airApp（不猜测隐藏引擎状态）';
        refreshBtn.disabled = captureBtn.disabled = true;
        const handle = {
            session: null as unknown as AgentSessionImpl,
            close (): void { root.remove(); },
        };
        closeBtn.onclick = () => handle.close();
        return handle;
    }

    // ---- session（观察专用；面板不做属性编辑）----
    const session = createAgentSession({ app });
    statusEl.textContent = `session ${session.id}`;
    let closed = false;
    let timer: number | undefined;
    let raf = 0;
    const selected = { id: '' as string };

    const safe = (fn: () => void): void => {
        // 面板错误不进业务主循环：只写在面板状态行
        try { fn(); } catch (e) {
            statusEl.textContent = `panel error: ${e instanceof Error ? e.message : String(e)}`;
        }
    };

    const renderTree = (): void => safe(() => {
        const summary: SceneSummary = session.inspectScene();
        statusEl.textContent = `scene=${summary.name} nodes=${summary.nodeCount} components=${summary.componentCount}`
            + ` assets=${summary.uniqueAssetCount.total}${summary.truncated ? ' (truncated)' : ''}`;
        treeEl.textContent = '';
        const byId = new Map(summary.nodes.map((n) => [n.id, n]));
        const depth = (n: { parentId: string | null }): number => {
            let d = 0;
            let p = n.parentId;
            while (p) { d++; p = byId.get(p)?.parentId ?? null; }
            return d;
        };
        for (const node of summary.nodes) {
            const row = el('div', 'cursor:pointer;padding:1px 0 1px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis');
            row.style.paddingLeft = `${depth(node) * 14 + 4}px`;
            row.textContent = `▸ ${node.name}  #${node.id}`;
            if (node.id === selected.id) { row.style.color = '#ffd97e'; }
            row.onclick = () => { selected.id = node.id; safe(renderAll); };
            treeEl.appendChild(row);
        }
    });

    const renderDetail = (): void => safe(() => {
        detailEl.textContent = '';
        if (!selected.id) {
            detailEl.textContent = '（在 Scene Tree 中选择节点）';
            return;
        }
        const view: NodeSummary = session.inspectNode(selected.id);
        const add = (text: string): void => { detailEl.appendChild(el('div', undefined, text)); };
        add(`name: ${view.name}   id: ${view.id}`);
        add(`active: ${view.active} (self ${view.activeSelf})   parent: ${view.parentId ?? '—'}`);
        add(`local pos: ${view.local.position.map((v) => +v.toFixed(3)).join(', ')}`);
        add(`local euler: ${view.local.rotationEuler.map((v) => +v.toFixed(1)).join(', ')}   scale: ${view.local.scale.map((v) => +v.toFixed(2)).join(', ')}`);
        add(`world pos: ${view.world.position.map((v) => +v.toFixed(3)).join(', ')}`);
        for (const c of view.components) {
            add(`· ${c.type} (${c.id})${c.enabled ? '' : ' [disabled]'}`);
        }
    });

    const renderAssets = (): void => safe(() => {
        assetEl.textContent = '';
        const report = session.inspectAsset();
        const head = el('div');
        head.innerHTML = '';
        head.textContent = `ok=${report.ok} unique=${JSON.stringify(report.counts)}${report.truncated ? ' (truncated)' : ''}`;
        assetEl.appendChild(head);
        for (const d of report.diagnostics as { code: string; location: string; message: string }[]) {
            assetEl.appendChild(el('div', 'color:#ff9c8a', `! ${d.code} ${d.location}: ${d.message}`));
        }
        assetEl.appendChild(el('div', 'color:#677', `unchecked=${(report.unchecked as unknown[]).length}（只读边界，不判 PASS）`));
    });

    const renderErrors = (): void => safe(() => {
        errorEl.textContent = '';
        const { errors, dropped } = session.getRuntimeErrors({ limit: 50 });
        if (dropped > 0) { errorEl.appendChild(el('div', 'color:#89a', `…已丢弃 ${dropped} 条`)); }
        if (errors.length === 0) { errorEl.appendChild(el('div', 'color:#677', '（无）')); }
        for (const e of errors as RuntimeErrorMessage[]) {
            const row = el('div', 'color:#ffcf8a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis');
            row.textContent = `#${e.seq} ${e.category}: ${e.message.slice(0, 120)}`;
            row.title = e.message;
            errorEl.appendChild(row);
        }
    });

    const renderPerf = (): void => safe(() => {
        perfEl.textContent = '';
        const stats = window.__glStats;
        const lines = [
            `draws: ${stats ? stats.draws : 'unavailable（无 prelude）'}`,
            `shader/link errs: ${stats ? stats.shaderErrs.length + stats.linkErrs.length : 'unavailable'}`,
        ];
        if (frameStat.samples > 1) {
            lines.push(`fps: ${frameStat.fps.toFixed(0)}   frame: ${frameStat.avgMs.toFixed(1)}ms`);
        }
        const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        lines.push(`js heap: ${mem ? `${(mem.usedJSHeapSize / 1048576).toFixed(1)}MB` : 'unavailable'}`);
        for (const line of lines) { perfEl.appendChild(el('div', undefined, line)); }
    });

    const renderCapture = (): void => safe(() => {
        captureEl.textContent = '';
        captureEl.appendChild(el('div', 'color:#677', '点击「截图」获取 AFTER_DRAW 时刻的 canvas PNG'));
    });

    // 性能采样（面板自有 rAF；close 时取消）
    const frameStat = { samples: 0, last: 0, avgMs: 0, fps: 0, windowStart: 0, frames: 0 };
    const tick = (now: number): void => {
        if (closed) { return; }
        if (frameStat.last) {
            const dt = now - frameStat.last;
            frameStat.avgMs = frameStat.avgMs ? frameStat.avgMs * 0.9 + dt * 0.1 : dt;
            frameStat.frames++;
            if (now - frameStat.windowStart > 1000) {
                frameStat.fps = frameStat.frames * 1000 / (now - frameStat.windowStart);
                frameStat.frames = 0;
                frameStat.windowStart = now;
                safe(renderPerf);
            }
        } else {
            frameStat.windowStart = now;
        }
        frameStat.last = now;
        frameStat.samples++;
        raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const renderAll = (): void => { renderTree(); renderDetail(); renderAssets(); renderErrors(); renderPerf(); };

    refreshBtn.onclick = () => safe(renderAll);
    captureBtn.onclick = () => safe(async () => {
        captureEl.textContent = 'capturing…';
        try {
            const frame = await session.captureFrame();
            captureEl.textContent = '';
            const img = document.createElement('img');
            img.src = frame.png;
            img.style.cssText = 'width:100%;border:1px solid #345;border-radius:4px;background:#000';
            captureEl.appendChild(img);
            captureEl.appendChild(el('div', 'color:#677', `frame#${frame.frameIndex} ${frame.width}x${frame.height} @ ${frame.sampledAt}`));
            const link = el('a', 'color:#9cf', '下载 PNG') as HTMLAnchorElement;
            link.href = frame.png;
            link.download = `cocosair-frame-${frame.frameIndex}.png`;
            captureEl.appendChild(link);
        } catch (e) {
            captureEl.textContent = `capture failed: ${e instanceof Error ? e.message : String(e)}`;
        }
    });

    // 键盘：Alt+D 开关；Esc 关闭（面板聚焦时）
    const onKey = (e: KeyboardEvent): void => {
        if (e.altKey && (e.key === 'd' || e.key === 'D')) {
            root.style.display = root.style.display === 'none' ? 'flex' : 'none';
        } else if (e.key === 'Escape' && root.contains(document.activeElement)) {
            handle.close();
        }
    };
    window.addEventListener('keydown', onKey, true);

    const close = (): void => {
        if (closed) { return; }
        closed = true;
        cancelAnimationFrame(raf);
        if (timer !== undefined) { clearInterval(timer); }
        window.removeEventListener('keydown', onKey, true);
        session.close();
        root.remove();
    };
    const handle: DebugPanelHandle = { session, close };
    closeBtn.onclick = () => close();

    safe(renderAll);
    safe(renderCapture);
    // 可见时低频自动刷新（隐藏页签时暂停，避免无谓开销）
    timer = window.setInterval(() => {
        if (!closed && document.visibilityState === 'visible') { safe(renderAll); }
    }, 1500);

    return handle;
}
