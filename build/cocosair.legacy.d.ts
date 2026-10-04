export * from './cocosair.module.js';
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
