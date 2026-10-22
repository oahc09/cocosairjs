// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Inspect actual memory declarations, not only compile options.
export function inspectWasmMemory(bytes) {
    if (
        bytes.length < 8 ||
        bytes[0] !== 0 ||
        bytes[1] !== 97 ||
        bytes[2] !== 115 ||
        bytes[3] !== 109 ||
        bytes[4] !== 1
    ) {
        throw new Error('Invalid WASM header');
    }
    let cursor = 8;
    const memories = [];
    function integer() {
        let value = 0,
            shift = 0;
        for (let i = 0; i < 5; ++i) {
            if (cursor >= bytes.length) throw new Error('Truncated WASM integer');
            const byte = bytes[cursor++];
            value += (byte & 127) * 2 ** shift;
            if (!(byte & 128)) return value;
            shift += 7;
        }
        throw new Error('Invalid WASM32 integer');
    }
    function name() {
        const size = integer();
        cursor += size;
        if (cursor > bytes.length) throw new Error('Truncated WASM name');
    }
    function limits(memory) {
        const flags = integer();
        if (flags & ~3) throw new Error('Unsupported memory/table limits');
        const initialPages = integer();
        const maximumPages = flags & 1 ? integer() : null;
        if (memory) memories.push({ shared: !!(flags & 2), initialPages, maximumPages });
    }
    while (cursor < bytes.length) {
        const section = bytes[cursor++],
            size = integer(),
            end = cursor + size;
        if (end > bytes.length) throw new Error('Truncated WASM section');
        if (section === 2) {
            const count = integer();
            for (let i = 0; i < count; ++i) {
                name();
                name();
                const kind = bytes[cursor++];
                if (kind === 0) integer();
                else if (kind === 1) {
                    cursor++;
                    limits(false);
                } else if (kind === 2) limits(true);
                else if (kind === 3) cursor += 2;
                else if (kind === 4) {
                    integer();
                    integer();
                } else throw new Error('Unsupported WASM import kind');
            }
        } else if (section === 5) {
            const count = integer();
            for (let i = 0; i < count; ++i) limits(true);
        }
        if (cursor > end) throw new Error('Invalid WASM section bounds');
        cursor = end;
    }
    if (memories.length !== 1 || memories[0].shared) throw new Error('ST WASM must have exactly one unshared memory');
    return memories[0];
}
