/* playwright-cli -s=label-shadow run-code --filename=tools/verify/label-shadow-browser.js */
async (page) => {
    const results = [];
    for (const dpr of [1, 2]) {
        const context = await page
            .context()
            .browser()
            .newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: dpr });
        try {
            const trial = await context.newPage();
            await trial.bringToFront();
            const errors = [];
            trial.on('pageerror', (error) => errors.push(error.message));
            trial.on('console', (message) => {
                if (message.type() === 'error') errors.push(message.text());
            });
            await trial.goto('http://127.0.0.1:7477/');
            await trial.waitForFunction(() => window.__labelShadowProbe?.ready, null, { timeout: 120000 });
            const report = await trial.evaluate(() => window.__labelShadowProbe);
            await trial.screenshot({ path: `build/reports/label-shadow/dpr-${dpr}.png` });
            results.push({
                dpr,
                checks: report.cases.length,
                richTextAvailable: report.richTextAvailable,
                failures: report.cases.filter((item) => !item.ok),
                errors: [...errors, ...report.errors],
                ok: report.ok && report.richTextAvailable === true && errors.length === 0,
            });
        } finally {
            await context.close();
        }
    }
    if (results.some((report) => !report.ok)) throw new Error(JSON.stringify(results));
    return { ok: true, results };
}
