const fs = require('node:fs');
const path = require('node:path');

// Explicit override or Playwright's matching default. Never substitute another executable after failure.
function chromiumOptions(env = process.env) {
    const options = {
        headless: true,
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
    };
    if (env.AIR_CI_SOFTWARE_GL === '1') options.args.push('--use-angle=swiftshader');
    if (env.AIR_CHROMIUM_PATH !== undefined) {
        if (!path.isAbsolute(env.AIR_CHROMIUM_PATH) || !fs.statSync(env.AIR_CHROMIUM_PATH).isFile()) {
            throw new Error('AIR_CHROMIUM_PATH must name an existing absolute browser executable');
        }
        options.executablePath = env.AIR_CHROMIUM_PATH;
    }
    return options;
}
module.exports = { chromiumOptions };
