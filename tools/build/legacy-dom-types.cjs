const fs = require('node:fs');
const path = require('node:path');

// Only the TS <5.0 package type condition includes these globals. Modern lib.dom
// owns the interfaces (including its evolving typed-array types) independently.
function writeLegacyDomTypes(root) {
    const declaration = `export * from './cocosair.module.js';
declare global {
    interface DecompressionStream {
        readonly readable: ReadableStream<Uint8Array>;
        readonly writable: WritableStream<BufferSource>;
    }
    var DecompressionStream: {
        prototype: DecompressionStream;
        new(format: 'deflate' | 'deflate-raw' | 'gzip'): DecompressionStream;
    };
}
`;
    fs.writeFileSync(path.join(root, 'build', 'cocosair.legacy.d.ts'), declaration);
}
module.exports = { writeLegacyDomTypes };
