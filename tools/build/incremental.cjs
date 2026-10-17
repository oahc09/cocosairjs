/* ccbuild 2.3.21 hard-codes Rollup cache:false. This process-local bridge keeps
 * its exact plugin/config pipeline, supplying Rollup's native module cache.
 * No dependency files are patched. The export is restored even on failure.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function withIncrementalCache(root, build) {
    const ccbuildEntry = require.resolve('@cocos/ccbuild');
    const rollup = require(require.resolve('rollup', { paths: [path.dirname(ccbuildEntry)] }));
    const original = rollup.rollup;
    const hash = crypto.createHash('sha256').update('air-cache-v1');
    for (const file of [
        'package-lock.json',
        'package.json',
        'babel.config.js',
        'tsconfig.json',
        'src/tsconfig.json',
        'src/cc.config.json',
        'src/package.json',
        'tools/build/build.cjs',
        'tools/build/incremental.cjs',
        'tools/build/esm-helpers.cjs',
        'tools/build/build-metadata.cjs',
        'tools/build/line-endings.cjs',
        'tools/build/webgpu-assets.cjs',
        'tools/build/builtin-assets.cjs',
    ]) {
        const filename = path.join(root, file);
        hash.update(file).update(fs.existsSync(filename) ? fs.readFileSync(filename) : 'missing');
    }
    const key = hash.update(process.version).update(rollup.VERSION).digest('hex');
    const dir = path.join(root, 'build', '.tmp-rollup-cache');
    const filename = path.join(dir, 'cache.json');
    let cache;
    let reason = 'cold';
    if (fs.existsSync(filename)) {
        try {
            const saved = JSON.parse(fs.readFileSync(filename, 'utf8'));
            if (saved.key === key) {
                cache = saved.cache;
                reason = 'hit';
            } else {
                reason = 'key-mismatch';
            }
        } catch (error) {
            reason = 'read-failure: ' + error.message;
            console.warn('[cache]', reason + '; rebuilding cold');
        }
    }
    const stats = { reused: !!cache, reason, transformed: 0, modules: 0, elapsedMs: 0 };
    let next;
    rollup.rollup = async (options) => {
        const result = await original({
            ...options,
            cache: cache || undefined,
            plugins: [
                ...options.plugins,
                {
                    name: 'air-transform-count',
                    transform() {
                        stats.transformed++;
                        return null;
                    },
                },
            ],
        });
        next = result.cache;
        stats.modules = next.modules.length;
        return result;
    };
    const start = Date.now();
    try {
        await build();
        stats.elapsedMs = Date.now() - start;
        if (next) {
            fs.mkdirSync(dir, { recursive: true });
            const temporary = path.join(dir, `cache-${process.pid}.json`);
            fs.writeFileSync(temporary, JSON.stringify({ key, cache: next }));
            fs.renameSync(temporary, filename);
            fs.writeFileSync(path.join(dir, 'last-build.json'), JSON.stringify(stats, null, 2));
        }
        console.log('[cache]', JSON.stringify(stats));
        return stats;
    } catch (error) {
        // A failed transform must never become the baseline for the next build.
        stats.reason = 'build-error: ' + error.message;
        try {
            fs.unlinkSync(filename);
        } catch (cleanup) {
            if (cleanup.code !== 'ENOENT') console.warn(cleanup.message);
        }
        throw error;
    } finally {
        rollup.rollup = original;
    }
}
async function acquireBuildLock(root) {
    const dir = path.join(root, 'build', '.tmp-rollup-cache');
    fs.mkdirSync(dir, { recursive: true });
    const filename = path.join(dir, 'build.lock');
    const start = Date.now();
    while (true) {
        try {
            const fd = fs.openSync(filename, 'wx');
            fs.writeFileSync(fd, String(process.pid));
            fs.closeSync(fd);
            return () => fs.unlinkSync(filename);
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
            try {
                const pid = Number(fs.readFileSync(filename, 'utf8'));
                if (pid > 0) {
                    try {
                        process.kill(pid, 0);
                    } catch (probe) {
                        if (probe.code === 'ESRCH') {
                            fs.unlinkSync(filename);
                            continue;
                        }
                    }
                }
            } catch (race) {
                if (race.code === 'ENOENT') continue;
                throw race;
            }
            if (Date.now() - start > 300000) throw new Error('Timed out waiting for another Air build');
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
    }
}
module.exports = { withIncrementalCache, acquireBuildLock };
