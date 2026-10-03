/** Keep ambient proxy settings, but route local verification servers directly. */
function loopbackBrowserEnv(env = process.env) {
    const entries = [env.NO_PROXY || '', env.no_proxy || '', '127.0.0.1,localhost,::1']
        .flatMap((value) => value.split(','))
        .map((value) => value.trim())
        .filter(Boolean);
    const bypass = [...new Set(entries)].join(',');
    return { ...env, NO_PROXY: bypass, no_proxy: bypass };
}
module.exports = { loopbackBrowserEnv };
