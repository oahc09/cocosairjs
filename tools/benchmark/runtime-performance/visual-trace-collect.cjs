'use strict';

const { resolve } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { anchorName, captureCategory } = require('./visual-trace.cjs');
const { writeNew } = require('./evidence.cjs');

const maxBytes = 28 * 1024 * 1024;
const maxEvents = 20000;
const categories = ['blink.user_timing', captureCategory];

async function streamTrace(cdp, exercise) {
    const traceEvents = [];
    let count = 0;
    let size = 0;
    let overflow = false;
    let timeout;
    let onComplete;
    const onData = ({ value }) => {
        if (!Array.isArray(value) || overflow) return;
        for (const event of value) {
            if (++count > maxEvents || (size += Buffer.byteLength(JSON.stringify(event))) > maxBytes) {
                overflow = true;
                break;
            }
            traceEvents.push(event);
        }
    };
    cdp.on('Tracing.dataCollected', onData);
    const complete = new Promise((resolve) => {
        onComplete = resolve;
        cdp.once('Tracing.tracingComplete', onComplete);
    });
    try {
        await cdp.send('Tracing.start', {
            transferMode: 'ReportEvents',
            traceConfig: { includedCategories: categories },
        });
        try {
            await exercise();
        } finally {
            await cdp.send('Tracing.end');
        }
        const eventsComplete = await Promise.race([
            complete,
            new Promise((_, reject) => {
                timeout = setTimeout(() => reject(new Error('Trace completion timeout')), 8000);
            }),
        ]);
        if (overflow || eventsComplete.dataLossOccurred) throw new Error('Trace exceeded bounds or lost data');
        return traceEvents;
    } finally {
        clearTimeout(timeout);
        cdp.removeListener('Tracing.dataCollected', onData);
        cdp.removeListener('Tracing.tracingComplete', onComplete);
    }
}

async function main([executable, rawUrl, output, waitMs, mode, ...rest]) {
    const url = new URL(rawUrl);
    const ms = Number(waitMs);
    if (
        !executable ||
        !output ||
        rest.length ||
        url.protocol !== 'http:' ||
        url.hostname !== '127.0.0.1' ||
        url.username ||
        url.password ||
        !Number.isInteger(ms) ||
        ms < 300 ||
        ms > 4000 ||
        !['headless', 'headed'].includes(mode)
    )
        throw new Error(
            'Usage: visual-trace-collect.cjs CHROMIUM HTTP_LOOPBACK_URL NEW_TRACE.json 300..4000 headed|headless',
        );

    const { chromium } = require('playwright');
    const browser = await chromium.launch({
        executablePath: resolve(executable),
        headless: mode === 'headless',
        chromiumSandbox: true,
    });
    let report;
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('requestfailed', (request) => errors.push(request.failure()?.errorText));
        await page.addInitScript((name) => {
            if (window.top === window) performance.mark(name);
        }, anchorName);
        const cdp = await page.context().newCDPSession(page);
        const traceEvents = await streamTrace(cdp, async () => {
            await page.goto(url.href, { waitUntil: 'commit', timeout: 7000 });
            await delay(ms);
        });
        if (errors.length || new URL(page.url()).origin !== url.origin)
            throw new Error('Trace page did not stay on the intended local workload: ' + errors.join('; '));
        report = {
            meta: {
                mode,
                url: url.href,
                observationMsAfterNavigationCommit: ms,
                browserVersion: browser.version(),
                categories,
                description: 'isolated visual calibration only; not an ordinary benchmark sample',
            },
            traceEvents,
        };
    } finally {
        await browser.close();
    }
    writeNew(output, report);
}

if (require.main === module)
    main(process.argv.slice(2)).catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
module.exports = { streamTrace };
