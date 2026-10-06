const path = require('path');
const fs = require('fs');
const MagicString = require('magic-string');

function resolveBuildDate(epoch, now = new Date()) {
    if (epoch !== undefined && !/^\d+$/.test(epoch)) throw Error('SOURCE_DATE_EPOCH must be a non-negative integer in Unix seconds');
    const date = epoch === undefined ? now : new Date(Number(epoch) * 1000);
    if (!Number.isFinite(date.getTime())) throw Error('SOURCE_DATE_EPOCH is outside the supported date range');
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map(p => [p.type, p.value]));
    const value = parts.year.padStart(4, '0') + parts.month + parts.day + parts.hour + parts.minute;
    if (!/^\d{12}$/.test(value)) throw Error('SOURCE_DATE_EPOCH is outside the yyyyMMddHHmm date range');
    return value;
}

function readBuildNumber(root) {
    const state = JSON.parse(fs.readFileSync(path.join(root, 'tools/build/build-number.json'), 'utf8'));
    if (!Number.isSafeInteger(state.lastBuildNumber) || state.lastBuildNumber < 0 || state.lastBuildNumber >= Number.MAX_SAFE_INTEGER) {
        throw Error('Invalid lastBuildNumber in tools/build/build-number.json');
    }
    return state.lastBuildNumber;
}

// The existing build lock serializes reservation and commit. Failed compilation
// never commits its number. Store state outside generated build/ so cleanup does
// not reset the counter, and use rename to avoid a partially written JSON file.
function commitBuildNumber(root, number) {
    if (readBuildNumber(root) !== number - 1) throw Error('Build number changed concurrently');
    const file = path.join(root, 'tools/build/build-number.json');
    const temporary = file + '.' + process.pid + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify({ lastBuildNumber: number }, null, 2) + '\n', { flag: 'wx' });
    try { fs.renameSync(temporary, file); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

function buildMetadataPlugin(root, buildDate, buildNumber) {
    if (!/^\d{12}$/.test(buildDate) || !Number.isSafeInteger(buildNumber) || buildNumber < 1) {
        throw Error('Invalid AIR build date or compilation number');
    }
    const target = path.resolve(root, 'src/air/app.ts');
    return {
        name: 'air-build-metadata',
        // A new build must not reuse the previous timestamp from Rollup's cache.
        shouldTransformCachedModule({ id }) { return path.resolve(id) === target ? true : null; },
        transform(code, id) {
            if (path.resolve(id) !== target) return null;
            const match = /(export\s+const\s+AIR_BUILD_DATE\s*:\s*string\s*=\s*)(['"])unbuilt\2/.exec(code);
            if (!match) throw Error('AIR_BUILD_DATE source declaration is missing or invalid');
            const source = new MagicString(code);
            source.overwrite(match.index + match[1].length, match.index + match[0].length, JSON.stringify(buildDate));
            const number = /(export\s+const\s+AIR_BUILD_NUMBER\s*:\s*number\s*=\s*)1\b/.exec(code);
            if (!number) throw Error('AIR_BUILD_NUMBER source declaration is missing or invalid');
            source.overwrite(number.index + number[1].length, number.index + number[0].length, String(buildNumber));
            return { code: source.toString(), map: source.generateMap({ hires: true, source: id, includeContent: true }) };
        },
    };
}

module.exports = { resolveBuildDate, readBuildNumber, commitBuildNumber, buildMetadataPlugin };
