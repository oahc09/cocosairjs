/**
 * §25 资源 Example 的 Lifecycle Contract（Code First 示例共用）。
 *
 * 示例把自己真实持有的资源交给本合同；浏览器验证器在取完截图后调用 window.__lifecycle()，
 * 本合同执行一轮「释放 → 等待延迟销毁 → 泄漏核对 → 重新获取并挂回场景」并回报规范化结果。
 * 这样"资源已释放"是机器可验收的合同，而不是源码里一行从未被证明执行过的 destroy()。
 * MaterialInstance 等即时 GPU 资源可保持 CCObject.isValid=true；显式 released() 应检查真实
 * pass/buffer 释放与调用事实，不得修改 _objFlags 或仅返回一个虚假的“已释放”常量。
 */
import { isValid } from 'cocosair';

function messageOf(error) {
    return String((error && error.message) || error || 'unknown error');
}

/** CCObject.destroy() 于帧末落地：等两帧 + 短延时，避免把 ToDestroy 误判为泄漏。 */
function settle() {
    return new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 250)));
    });
}

function ownedList(list) {
    return (list || []).filter((entry) => entry && entry.ref);
}

function leakedNames(list, errors) {
    return ownedList(list)
        .filter((entry) => {
            if (entry.released === undefined) return isValid(entry.ref);
            if (typeof entry.released !== 'function') {
                errors.push(`release check ${entry.name || 'unnamed'}: released must be a function`);
                return true;
            }
            try {
                const released = entry.released();
                if (typeof released !== 'boolean') throw new Error('released must return a boolean');
                return !released;
            } catch (error) {
                errors.push(`release check ${entry.name || 'unnamed'}: ${messageOf(error)}`);
                return true;
            }
        })
        .map((entry) => entry.name || 'unnamed');
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
        label: contract.label || 'asset-lifecycle',
        held: 0,
        released: false,
        leaked: [],
        reloaded: false,
        errors: [],
        runs: 0,
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
        await settle();
        report.leaked = leakedNames(held, report.errors);
        report.released = report.leaked.length === 0;
        try {
            const reacquired = ownedList(await contract.reacquire());
            await settle();
            const invalid = reacquired
                .filter((entry) => {
                    if (!isValid(entry.ref)) return true;
                    if (entry.released === undefined) return false;
                    try {
                        if (typeof entry.released !== 'function') throw new Error('released must be a function');
                        const released = entry.released();
                        if (typeof released !== 'boolean') throw new Error('released must return a boolean');
                        return released;
                    } catch (error) {
                        report.errors.push(`reacquire check ${entry.name || 'unnamed'}: ${messageOf(error)}`);
                        return true;
                    }
                })
                .map((entry) => entry.name || 'unnamed');
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
