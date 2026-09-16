/**
 * V0.6 §54 — 首批 Validator（12 个）。
 *
 * Validator 是纯函数：输入 RuntimeSnapshot（由 Trial Runner 从 agent session 采集），
 * 输出确定性状态。禁止复制到各 Benchmark 内——Benchmark 通过 id 组合 Validator。
 */

/** 运行时快照：Runner 从 inspection / capture / error-report 通道采集的确定性数据。 */
export interface RuntimeSnapshot {
    scene: {
        sceneId: string;
        name: string;
        nodeCount: number;
        componentCount: number;
        componentsByType: Record<string, number>;
        cameraCount: number;
        lightCount: number;
        rendererCount: number;
        uniqueAssetCount: { total: number; byKind: Record<string, number> };
        nodes: { id: string; name: string; parentId: string | null }[];
        truncated: boolean;
    } | null;
    nodes: Record<string, {
        id: string;
        name: string;
        parentId: string | null;
        childrenIds: string[];
        active: boolean;
        activeSelf: boolean;
        components: { id: string; type: string; enabled: boolean }[];
        local: { position: number[]; rotationEuler: number[]; scale: number[] };
        world: { position: number[] };
    }>;
    assets: {
        ok: boolean;
        counts: Record<string, number>;
        diagnostics: { code: string; location: string; message: string }[];
        unchecked: unknown[];
    } | null;
    capture: { png: string; width: number; height: number; sceneId: string; frameIndex: number } | null;
    /** PNG 字节解码后的中心区域像素采样（Runner 负责 readPixels/toDataURL 解码）。 */
    centerPixel?: [number, number, number];
    runtimeErrors: { seq: number; category: string; message: string }[];
    capability?: { name: string; status: string };
}

export type ValidatorState = 'PASS' | 'FAIL' | 'EXPECTED_UNSUPPORTED' | 'EXPECTED_FALLBACK' | 'NOT_EVALUATED';

export interface ValidatorResult {
    validatorId: string;
    state: ValidatorState;
    detail?: string;
}

export interface Validator {
    id: string;
    evaluate (snapshot: RuntimeSnapshot, params: Record<string, unknown>): ValidatorResult;
}

const near = (a: number, b: number, eps = 1e-3): boolean => Math.abs(a - b) <= eps;

function pass (id: string, detail?: string): ValidatorResult {
    return { validatorId: id, state: 'PASS', detail };
}
function fail (id: string, detail: string): ValidatorResult {
    return { validatorId: id, state: 'FAIL', detail };
}

/** scene-ready：当前运行场景存在且可观察。 */
export const sceneReady: Validator = {
    id: 'scene-ready',
    evaluate (snapshot) {
        if (!snapshot.scene) { return fail('scene-ready', 'no running scene observed'); }
        return pass('scene-ready', `scene=${snapshot.scene.name}`);
    },
};

/** node-exists：按名称（或 id）存在。 */
export const nodeExists: Validator = {
    id: 'node-exists',
    evaluate (snapshot, params) {
        const name = String(params.name ?? '');
        const id = String(params.id ?? '');
        const hit = Object.values(snapshot.nodes).find((n) => (name ? n.name === name : true) && (id ? n.id === id : true));
        if (!hit) { return fail('node-exists', `node not found (name=${name || '*'}, id=${id || '*'})`); }
        return pass('node-exists', hit.id);
    },
};

/** node-count：精确或最少节点数。 */
export const nodeCount: Validator = {
    id: 'node-count',
    evaluate (snapshot, params) {
        if (!snapshot.scene) { return fail('node-count', 'no scene'); }
        const actual = snapshot.scene.nodeCount;
        if (params.min !== undefined && actual < Number(params.min)) { return fail('node-count', `${actual} < min ${params.min}`); }
        if (params.equals !== undefined && actual !== Number(params.equals)) { return fail('node-count', `${actual} != ${params.equals}`); }
        return pass('node-count', String(actual));
    },
};

/** transform-equals：local/world position 与 scale 断言。 */
export const transformEquals: Validator = {
    id: 'transform-equals',
    evaluate (snapshot, params) {
        const name = String(params.nodeName ?? '');
        const node = Object.values(snapshot.nodes).find((n) => n.name === name)
            ?? (params.nodeId ? snapshot.nodes[String(params.nodeId)] : undefined);
        if (!node) { return fail('transform-equals', `node not found: ${name || params.nodeId}`); }
        const space = params.space === 'world' ? node.world : { position: node.local.position };
        if (params.position) {
            const expected = params.position as number[];
            if (!expected.every((v, i) => near(space.position[i], v))) {
                return fail('transform-equals', `position ${JSON.stringify(space.position)} != ${JSON.stringify(expected)} (${params.space ?? 'local'})`);
            }
        }
        if (params.scale && !node.local.scale) {
            return fail('transform-equals', 'scale missing');
        }
        if (params.scale) {
            const expected = params.scale as number[];
            if (!expected.every((v, i) => near(node.local.scale[i], v))) {
                return fail('transform-equals', `scale ${JSON.stringify(node.local.scale)} != ${JSON.stringify(expected)}`);
            }
        }
        return pass('transform-equals', name);
    },
};

/** asset-loaded：唯一资源计数达到门槛，且无 DESTROYED/MISSING 诊断。 */
export const assetLoaded: Validator = {
    id: 'asset-loaded',
    evaluate (snapshot, params) {
        if (!snapshot.assets) { return fail('asset-loaded', 'no asset report'); }
        const kind = params.kind ? String(params.kind) : null;
        const min = params.min !== undefined ? Number(params.min) : 1;
        const counts = snapshot.assets.counts;
        const total = kind ? (counts[kind] ?? 0) : Object.values(counts).reduce((s, n) => s + n, 0);
        if (total < min) { return fail('asset-loaded', `assets ${kind ?? 'total'}=${total} < ${min}`); }
        const blocking = snapshot.assets.diagnostics.filter((d) => d.code === 'MISSING_DEPENDENCY' || d.code === 'DESTROYED_RESOURCE' || d.code === 'TYPE_MISMATCH');
        if (blocking.length > 0) { return fail('asset-loaded', `diagnostics: ${blocking.map((d) => d.code).join(',')}`); }
        return pass('asset-loaded', `${kind ?? 'total'}=${total}`);
    },
};

/** animation-playing：场景含 Animation 组件（运行状态由 runner 侧采样扩展）。 */
export const animationPlaying: Validator = {
    id: 'animation-playing',
    evaluate (snapshot) {
        const count = snapshot.scene?.componentsByType.Animation ?? 0;
        if (count === 0) { return fail('animation-playing', 'no Animation component in scene'); }
        return pass('animation-playing', `${count} animation component(s)`);
    },
};

/** material-property：材质诊断零致命 + 指定材质唯一资源存在。 */
export const materialProperty: Validator = {
    id: 'material-property',
    evaluate (snapshot, params) {
        if (!snapshot.assets) { return fail('material-property', 'no asset report'); }
        const min = params.min !== undefined ? Number(params.min) : 1;
        if ((snapshot.assets.counts.Material ?? 0) < min) { return fail('material-property', `materials < ${min}`); }
        if (!snapshot.assets.ok) { return fail('material-property', `asset report not ok: ${snapshot.assets.diagnostics.map((d) => d.code).join(',')}`); }
        return pass('material-property');
    },
};

/** no-runtime-error：窗口/shader/link/session-load 错误为零（或不超过 max）。 */
export const noRuntimeError: Validator = {
    id: 'no-runtime-error',
    evaluate (snapshot, params) {
        const max = params.max !== undefined ? Number(params.max) : 0;
        if (snapshot.runtimeErrors.length > max) {
            return fail('no-runtime-error', `${snapshot.runtimeErrors.length} errors: ${snapshot.runtimeErrors.slice(0, 3).map((e) => `${e.category}:${e.message.slice(0, 60)}`).join(' | ')}`);
        }
        return pass('no-runtime-error');
    },
};

/** visible-frame：画面中心出现与清屏色不同的前景（真实可见性判定）。 */
export const visibleFrame: Validator = {
    id: 'visible-frame',
    evaluate (snapshot) {
        if (!snapshot.capture) { return fail('visible-frame', 'no frame captured'); }
        if (!snapshot.centerPixel) { return fail('visible-frame', 'no pixel sample'); }
        const [r, g, b] = snapshot.centerPixel;
        // 背景判定：接近清屏色(30,40,60) 或近黑；否则视为前景（暗灰 lit 表面属于前景）
        const nearClear = Math.abs(r - 30) < 12 && Math.abs(g - 40) < 12 && Math.abs(b - 60) < 12;
        const nearBlack = r + g + b < 45;
        if (nearClear || nearBlack) { return fail('visible-frame', `center pixel ${r},${g},${b} looks like clear color`); }
        return pass('visible-frame', `center=${r},${g},${b}`);
    },
};

/** frame-diff：两帧画面不同（新帧证据，不采信旧截图）。 */
export const frameDiff: Validator = {
    id: 'frame-diff',
    evaluate (snapshot, params) {
        const before = params.beforePng as string | undefined;
        if (!snapshot.capture?.png) { return fail('frame-diff', 'no current frame'); }
        if (!before) { return fail('frame-diff', 'no baseline frame provided'); }
        if (before === snapshot.capture.png) { return fail('frame-diff', 'frames identical (stale capture?)'); }
        return pass('frame-diff');
    },
};

/** capability-status：能力状态合同（supported/unsupported/fallback 与稳定错误码一致）。 */
export const capabilityStatus: Validator = {
    id: 'capability-status',
    evaluate (snapshot, params) {
        const required = String(params.requires ?? '');
        const capability = snapshot.capability;
        if (!capability) { return fail('capability-status', `capability '${required}' not reported`); }
        // 能力名必须匹配：snapshot 报告的 capability.name 必须覆盖 params.requires 所指的能力
        if (required && capability.name !== required) {
            return fail('capability-status', `capability name mismatch: expected '${required}', got '${capability.name}'`);
        }
        if (capability.status === 'unsupported') { return { validatorId: 'capability-status', state: 'EXPECTED_UNSUPPORTED', detail: required }; }
        if (capability.status === 'fallback') { return { validatorId: 'capability-status', state: 'EXPECTED_FALLBACK', detail: required }; }
        return pass('capability-status', `${required}=${capability.status}`);
    },
};

/** resource-released：资产报告无 DESTROYED_RESOURCE（生命周期收尾证据）。 */
export const resourceReleased: Validator = {
    id: 'resource-released',
    evaluate (snapshot) {
        if (!snapshot.assets) { return fail('resource-released', 'no asset report'); }
        const destroyed = snapshot.assets.diagnostics.filter((d) => d.code === 'DESTROYED_RESOURCE');
        if (destroyed.length > 0) { return fail('resource-released', `${destroyed.length} destroyed resources`); }
        return pass('resource-released');
    },
};

/** 首批 Validator 注册表（§54：Benchmark 通过 id 组合，不得内联复制）。 */
export const VALIDATORS: Record<string, Validator> = {
    'scene-ready': sceneReady,
    'node-exists': nodeExists,
    'node-count': nodeCount,
    'transform-equals': transformEquals,
    'asset-loaded': assetLoaded,
    'animation-playing': animationPlaying,
    'material-property': materialProperty,
    'no-runtime-error': noRuntimeError,
    'visible-frame': visibleFrame,
    'frame-diff': frameDiff,
    'capability-status': capabilityStatus,
    'resource-released': resourceReleased,
};

/** 组合执行：全部 PASS → true（§51 Reference Track 支持环境内 100% PASS）。 */
export function runValidators (ids: string[], snapshot: RuntimeSnapshot, paramsById: Record<string, Record<string, unknown>> = {}): ValidatorResult[] {
    return ids.map((id) => {
        const validator = VALIDATORS[id];
        if (!validator) { return { validatorId: id, state: 'NOT_EVALUATED' as const, detail: 'unknown validator id' }; }
        return validator.evaluate(snapshot, paramsById[id] ?? {});
    });
}
