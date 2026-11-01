// Owned Playwright child closure for opt-in collectors. No browser is imported or launched by requiring this file.
async function bounded(operation, ms, label) {
    let timer;
    try {
        return await Promise.race([
            Promise.resolve().then(operation),
            new Promise((_, reject) => (timer = setTimeout(() => reject(Error(label + ' deadline')), ms))),
        ]);
    } finally {
        clearTimeout(timer);
    }
}
async function launchOwnedBrowser(engine, options, report, closeDeadlineMs = 4000) {
    const server = await engine.launchServer(options);
    const child = server.process();
    report.browserProcess = { pid: child.pid, closeObserved: false };
    const exited = new Promise((resolve) => {
        child.once('close', (code, signal) => {
            Object.assign(report.browserProcess, { closeObserved: true, code, signal });
            resolve();
        });
    });
    let browser;
    async function close() {
        const errors = [];
        for (const [name, object] of [
            ['transport', browser],
            ['browser-server', server],
        ]) {
            try {
                if (object) await bounded(() => object.close(), closeDeadlineMs, name + ' close');
            } catch (error) {
                errors.push(String(error));
            }
        }
        try {
            await bounded(() => exited, closeDeadlineMs, 'physical child close');
        } catch (error) {
            errors.push(String(error));
        }
        report.browserProcess.closeErrors = errors;
        if (errors.length) throw Error(errors.join('; '));
    }
    try {
        browser = await engine.connect(server.wsEndpoint());
    } catch (error) {
        try {
            await close();
        } catch (cleanup) {
            throw new AggregateError([error, cleanup], 'Connect and cleanup failed');
        }
        throw error;
    }
    return { browser, close };
}
module.exports = { bounded, launchOwnedBrowser };
