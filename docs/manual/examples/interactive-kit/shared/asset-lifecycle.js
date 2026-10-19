/**
 * §25 资源 Example 的 Lifecycle Contract（Code First 示例共用）。
 *
 * 示例把自己真实持有的资源交给本合同；浏览器验证器在取完截图后调用 window.__lifecycle()，
 * 本合同执行一轮「释放 → 等待延迟销毁 → 泄漏核对 → 重新获取并挂回场景」并回报规范化结果。
 * 这样"资源已释放"是机器可验收的合同，而不是源码里一行从未被证明执行过的 destroy()。
 * MaterialInstance 等即时 GPU 资源可保持 CCObject.isValid=true；显式 released() 应检查真实
 * pass/buffer 释放与调用事实，不得修改 _objFlags 或仅返回一个虚假的“已释放”常量。
 */
import { isValid, director, Director } from 'cocosair';

function messageOf(error) {
    return String((error && error.message) || error || 'unknown error');
}

/**
 * CCObject's queue only drains entries present at the start of an engine update.
 * A node's onDestroy (and GLTFAsset's following microtask) can enqueue assets for
 * the next update. Browser rAF callbacks do not prove that either update ran.
 * Count two complete update -> draw cycles, separated by a microtask checkpoint.
 * Do not step the engine, flush its private queue, or alter resource flags.
 */
function settle() {
    return new Promise((resolve) => {
        const proof = {
            source: 'director-update-then-draw',
            frames: [],
            cycles: 0,
            completed: false,
            deadlineMs: 8000,
        };
        const startedAt = performance.now();
        let armed = true;
        let updatedFrame = null;
        let done = false;
        const finish = (completed) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            director.off(Director.EVENT_AFTER_UPDATE, onUpdate);
            director.off(Director.EVENT_AFTER_DRAW, onDraw);
            proof.completed = completed;
            proof.elapsedMs = performance.now() - startedAt;
            resolve(proof);
        };
        const withinDeadline = () => {
            if (performance.now() - startedAt >= proof.deadlineMs) finish(false);
            return !done;
        };
        const onUpdate = () => {
            if (!withinDeadline() || !armed) return;
            const frame = director.getTotalFrames();
            updatedFrame = Number.isSafeInteger(frame) && frame >= 0 ? frame : null;
        };
        const onDraw = () => {
            if (!withinDeadline() || !armed || updatedFrame === null) return;
            const frame = director.getTotalFrames();
            if (frame !== updatedFrame || (proof.frames.length && frame <= proof.frames.at(-1))) return;
            armed = false;
            updatedFrame = null;
            proof.frames.push(frame);
            proof.cycles++;
            // A same-task manual second frame cannot outrun GLTF's queued release.
            queueMicrotask(() => {
                if (!withinDeadline()) return;
                if (proof.cycles === 2) finish(true);
                else armed = true;
            });
        };
        const timer = setTimeout(() => finish(false), proof.deadlineMs);
        // Registered only after release/reacquire resolves: a draw belonging to
        // an already-started update is never counted as a complete cycle.
        director.on(Director.EVENT_AFTER_UPDATE, onUpdate);
        director.on(Director.EVENT_AFTER_DRAW, onDraw);
    });
}

function ownedList(list) {
    return (list || []).filter((entry) => entry && entry.ref);
}

function observeOwned(list, errors, phase) {
    return ownedList(list).map((entry) => {
        const name = entry.name || 'unnamed';
        const valid = isValid(entry.ref);
        const predicate = entry.released !== undefined;
        let released = !valid;
        if (predicate) {
            try {
                if (typeof entry.released !== 'function') throw new Error('released must be a function');
                released = entry.released();
                if (typeof released !== 'boolean') throw new Error('released must return a boolean');
            } catch (error) {
                errors.push(`${phase} check ${name}: ${messageOf(error)}`);
                released = phase === 'release' ? false : true;
            }
        }
        return {
            name,
            valid,
            predicate,
            released,
            refCount: typeof entry.ref.refCount === 'number' ? entry.ref.refCount : null,
            passCount: Array.isArray(entry.ref.passes) ? entry.ref.passes.length : null,
        };
    });
}

/**
 * @param {object} contract
 * @param {string} contract.label                       报告标识（示例名）
 * @param {() => Array<{name: string, ref: object, released?: () => boolean}>} contract.hold 当前持有的资源；即时 GPU 资源可选真实释放谓词
 * @param {() => (void | Promise<void>)} contract.release                 真实释放路径
 * @param {() => Promise<Array<{name: string, ref: object}>>} contract.reacquire  重新获取并挂回场景
 */
export function installAssetLifecycle(contract) {
    const report = {
        schemaVersion: 'example-asset-lifecycle/1',
        label: contract.label || 'asset-lifecycle',
        held: 0,
        released: false,
        leaked: [],
        reloaded: false,
        errors: [],
        runs: 0,
        settlement: { release: null, reacquire: null },
        observations: { released: [], reacquired: [] },
    };
    window.__lifecycle = async () => {
        report.runs++;
        if (report.runs > 1) {
            return report;
        } // 幂等：一轮运行只拆建一次，重复调用回报同一结果
        const held = ownedList(typeof contract.hold === 'function' ? contract.hold() : contract.held);
        report.held = held.length;
        if (held.length === 0) {
            report.errors.push('hold() reported no owned resources');
            return report;
        }
        try {
            await contract.release();
        } catch (error) {
            report.errors.push('release: ' + messageOf(error));
        }
        report.settlement.release = await settle();
        if (!report.settlement.release.completed) report.errors.push('release: engine settlement deadline');
        report.observations.released = observeOwned(held, report.errors, 'release');
        report.leaked = report.observations.released.filter((entry) => !entry.released).map((entry) => entry.name);
        report.released = report.leaked.length === 0;
        try {
            const reacquired = ownedList(await contract.reacquire());
            report.settlement.reacquire = await settle();
            if (!report.settlement.reacquire.completed) report.errors.push('reacquire: engine settlement deadline');
            report.observations.reacquired = observeOwned(reacquired, report.errors, 'reacquire');
            const invalid = report.observations.reacquired
                .filter((entry) => !entry.valid || (entry.predicate && entry.released))
                .map((entry) => entry.name);
            report.reloaded = reacquired.length > 0 && invalid.length === 0;
            if (!report.reloaded) {
                report.errors.push(
                    'reacquire: ' +
                        (reacquired.length === 0
                            ? 'returned no resources'
                            : invalid.join(',') + ' invalid after reacquire'),
                );
            }
        } catch (error) {
            report.errors.push('reacquire: ' + messageOf(error));
        }
        return report;
    };
    // 非消费型就绪探针：只读 hold() 数量，绝不触发拆建轮。__lifecycle 的首次调用即运行整轮
    // 且此后幂等返回同一报告——验收端若直接轮询它，会把「资产尚未就绪」永久烧进报告
    // （video-basic 在 gallery 部署验收 r46 实测 held=0 的根因）。
    window.__lifecycleHold = function () {
        try {
            const held = ownedList(typeof contract.hold === 'function' ? contract.hold() : contract.held);
            return held.length;
        } catch (error) {
            return 0;
        }
    };
    return report;
}
