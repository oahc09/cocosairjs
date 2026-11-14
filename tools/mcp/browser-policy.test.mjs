import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { openBrowser } from './browser.mjs';

const target = 'http://127.0.0.1:7454/hello-cube/';
async function fixture(t, evaluate = async () => undefined) {
    let routeHandler;
    let physicalCloses = 0;
    const page = {
        on() {},
        async goto() {},
        async waitForFunction() {},
        async evaluateHandle() {
            return { evaluate };
        },
    };
    const context = {
        async route(_pattern, handler) {
            routeHandler = handler;
        },
        async routeWebSocket() {},
        async newPage() {
            return page;
        },
        on() {},
    };
    t.mock.method(chromium, 'launch', async () => ({
        async newContext() {
            return context;
        },
        async close() {
            physicalCloses++;
        },
    }));
    const adapter = await openBrowser({ url: target });
    t.after(() => adapter.close());
    return { adapter, route: (...args) => routeHandler(...args), closes: () => physicalCloses };
}

function requestRoute(url, navigation, status = 200) {
    const events = [];
    const response = { status: () => status };
    return {
        events,
        request: () => ({ url: () => url, isNavigationRequest: () => navigation }),
        async fetch(options) {
            events.push(['fetch', options]);
            return response;
        },
        async fulfill(options) {
            assert.equal(options.response, response);
            events.push(['fulfill']);
        },
        async abort(reason) {
            events.push(['abort', reason]);
        },
    };
}

test('browser routing fetches one hop and rejects every redirect before fulfillment', async (t) => {
    const f = await fixture(t);
    for (const navigation of [false, true]) {
        for (const status of [301, 302, 303, 307, 308]) {
            const route = requestRoute(target, navigation, status);
            await f.route(route);
            assert.deepEqual(route.events, [
                ['fetch', { maxRedirects: 0, timeout: 10000 }],
                ['abort', 'blockedbyclient'],
            ]);
        }
    }
    for (const [url, navigation] of [
        ['https://example.com/', false],
        ['http://127.0.0.1:7455/asset.js', false],
        ['http://127.0.0.1:7454/other-page/', true],
    ]) {
        const route = requestRoute(url, navigation);
        await f.route(route);
        assert.deepEqual(route.events, [['abort', 'blockedbyclient']]);
    }
    const permitted = requestRoute('http://127.0.0.1:7454/asset.js', false);
    await f.route(permitted);
    assert.deepEqual(permitted.events, [['fetch', { maxRedirects: 0, timeout: 10000 }], ['fulfill']]);
});

test('hung renderer cleanup cannot prevent physical shutdown and close callers share completion', async (t) => {
    const f = await fixture(t, () => new Promise(() => {}));
    const first = f.adapter.close();
    assert.equal(f.adapter.close(), first);
    assert.equal(f.closes(), 0);
    await assert.rejects(f.adapter.call('inspect', {}), { code: 'SESSION_CLOSED' });
    await first;
    assert.equal(f.closes(), 1);
    await f.adapter.close();
    assert.equal(f.closes(), 1);
});
