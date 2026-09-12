// Cocos AIR - jest config (Phase 16 smoke tests). jsdom + HEADLESS render mode.
module.exports = {
    "preset": "ts-jest",
    "testEnvironment": "jsdom",
    "setupFiles": ["<rootDir>/test/setup-dom.js", "<rootDir>/test/setup-engine.js"],
    "testRegex": "/test/smoke/.*\\.test\\.ts$",
    "transform": {
        "^.+\\.tsx?$": [
            "ts-jest",
            {
                "diagnostics": false
            }
        ],
        "^.+\\.js$": "babel-jest"
    },
    "moduleNameMapper": {
        "^internal:constants$": "<rootDir>/test/stubs/internal-constants.ts",
        "^internal:native$": "<rootDir>/src/cocos/native-binding/impl.ts",
        "^cc.decorator$": "<rootDir>/src/cocos/core/data/decorators/index.ts",
        "^@cocos/engine/(.*)$": "<rootDir>/src/$1",
        "^pal/audio$": "<rootDir>/src/pal/audio/web/player.js",
        "^pal/system-info$": "<rootDir>/src/pal/system-info/web/system-info.js",
        "^pal/screen-adapter$": "<rootDir>/src/pal/screen-adapter/web/screen-adapter.js",
        "^pal/input$": "<rootDir>/src/pal/input/web/index.js",
        "^pal/env$": "<rootDir>/src/pal/env/web/env.js",
        "^pal/pacer$": "<rootDir>/src/pal/pacer/pacer-web.js",
        "^pal/wasm$": "<rootDir>/test/stubs/pal-wasm.ts",
        "^pal/minigame$": "<rootDir>/src/pal/minigame/non-minigame.js"
    },
    "globals": {
        "CC_TEST": true
    },
    "testTimeout": 30000
};
