/* Cocos AIR script-worker protocol example. Replace runTask with a self-contained task. */
async function runTask(...args) {
    return args;
}
self.onmessage = async ({ data }) => {
    const { id, args } = data;
    try {
        self.postMessage({ id, ok: true, value: await runTask(...args) });
    } catch (error) {
        self.postMessage({ id, ok: false, error: String(error?.message || error) });
    }
};
