import { chromium } from 'playwright';

export function localPage(value) {
    const url = new URL(value);
    if (
        url.protocol !== 'http:' ||
        url.hostname !== '127.0.0.1' ||
        !url.port ||
        url.username ||
        url.password ||
        url.hash ||
        url.search
    ) {
        throw new Error(
            'Use an explicit http://127.0.0.1:PORT/path/ development page, without credentials, query or fragment.',
        );
    }
    return url;
}
export async function openBrowser({ url, writable = false, executablePath }) {
    const target = localPage(url);
    const browser = await chromium.launch({
        headless: true,
        executablePath,
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    let closed = false;
    let handle;
    let closing;
    const close = () => {
        if (closing) return closing;
        closed = true;
        closing = (async () => {
            let cleanupTimer;
            try {
                await Promise.race([
                    handle?.evaluate((bridge) => bridge.close()),
                    new Promise((resolve) => {
                        cleanupTimer = setTimeout(resolve, 500);
                    }),
                ]);
            } catch {
                /* Navigation or a hung renderer must not prevent physical shutdown. */
            } finally {
                clearTimeout(cleanupTimer);
                await browser.close();
            }
        })();
        return closing;
    };
    try {
        const context = await browser.newContext({
            viewport: { width: 640, height: 480 },
            deviceScaleFactor: 1,
            serviceWorkers: 'block',
            acceptDownloads: false,
        });
        await context.route('**/*', async (route) => {
            const request = route.request();
            const requested = new URL(request.url());
            const permitted =
                requested.origin === target.origin &&
                (!request.isNavigationRequest() || requested.href === target.href);
            if (!permitted) return route.abort('blockedbyclient');
            // Playwright route.continue follows redirects without re-running the handler.
            // Fetch exactly one hop; refuse every redirect, including same-origin ones.
            try {
                const response = await route.fetch({ maxRedirects: 0, timeout: 10000 });
                if (response.status() >= 300 && response.status() < 400) return route.abort('blockedbyclient');
                return route.fulfill({ response });
            } catch {
                return route.abort('failed');
            }
        });
        await context.routeWebSocket('**/*', (socket) => socket.close());
        const page = await context.newPage();
        page.on('dialog', (dialog) => dialog.dismiss());
        context.on('page', (extra) => {
            if (extra !== page) void extra.close();
        });
        await page.goto(target.href, { waitUntil: 'load', timeout: 15000 });
        await page.waitForFunction(() => window.__airApp?.getScene(), null, { timeout: 15000 });
        handle = await page.evaluateHandle(async (allowWrites) => {
            const { attachMcpBridge } = await import('/__debug/mcp-bridge.js');
            return attachMcpBridge(window.__airApp, allowWrites);
        }, writable);
        let pending = 0;
        return {
            writable,
            close,
            async call(method, args) {
                if (closed)
                    throw Object.assign(new Error('Session closed. Start a new MCP process.'), {
                        code: 'SESSION_CLOSED',
                    });
                if (pending) throw Object.assign(new Error('Browser operation already running.'), { code: 'BUSY' });
                pending++;
                let timer;
                let timedOut = false;
                try {
                    return await Promise.race([
                        handle.evaluate(
                            async (bridge, request) => {
                                try {
                                    return await bridge.call(request.method, request.args);
                                } catch (error) {
                                    return {
                                        ok: false,
                                        error: {
                                            code: error.code ?? 'BROWSER_FAILED',
                                            message: String(error.message ?? error).slice(0, 2000),
                                        },
                                    };
                                }
                            },
                            {
                                method,
                                args,
                            },
                        ),
                        new Promise((_, reject) => {
                            timer = setTimeout(() => {
                                timedOut = true;
                                reject(Object.assign(new Error('Operation deadline exceeded.'), { code: 'TIMEOUT' }));
                            }, 10000);
                        }),
                    ]);
                } catch (error) {
                    if (timedOut) {
                        try {
                            await close();
                        } catch (shutdown) {
                            throw Object.assign(
                                new Error(
                                    `Operation timed out; shutdown failed: ${shutdown}. Write outcome uncertain.`,
                                ),
                                { code: 'TIMEOUT' },
                            );
                        }
                        throw Object.assign(
                            new Error(
                                'Operation timed out; owned browser closed. Write outcome may be uncertain. Do not blindly retry.',
                            ),
                            { code: 'TIMEOUT' },
                        );
                    }
                    throw error;
                } finally {
                    clearTimeout(timer);
                    pending--;
                }
            },
        };
    } catch (error) {
        await close();
        throw error;
    }
}
