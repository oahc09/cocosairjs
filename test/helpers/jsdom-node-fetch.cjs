const { TestEnvironment } = require('jest-environment-jsdom');

module.exports = class NodeFetchEnvironment extends TestEnvironment {
    async setup() {
        await super.setup();
        this.global.fetch = globalThis.fetch;
        this.global.Headers = globalThis.Headers;
        this.global.Request = globalThis.Request;
        this.global.Response = globalThis.Response;
        // The engine checks ArrayBuffer identity after downloads; keep bytes in the test realm.
        const fetch = globalThis.fetch;
        const ArrayBuffer = this.global.ArrayBuffer;
        const Uint8Array = this.global.Uint8Array;
        this.global.fetch = async (...args) => {
            const response = await fetch(...args);
            const read = response.arrayBuffer.bind(response);
            response.arrayBuffer = async () => {
                const bytes = await read();
                const result = new ArrayBuffer(bytes.byteLength);
                new Uint8Array(result).set(new Uint8Array(bytes));
                return result;
            };
            return response;
        };
    }
};
