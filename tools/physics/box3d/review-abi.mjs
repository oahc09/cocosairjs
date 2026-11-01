// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Deterministic source comparison, NOT a binary/WASM ABI validation.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, sha256 } from './verify-sources.mjs';
function headers(prefix) {
    const dir = resolve(root, prefix, 'include/box3d');
    return readdirSync(dir)
        .sort()
        .map((file) => readFileSync(resolve(dir, file), 'utf8'))
        .join('\n');
}
function declarations(text) {
    const clean = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const result = new Map();
    for (const match of clean.matchAll(/^B3_API\s+([^;]+;)/gm)) {
        const name = /\b(b3\w+)\s*\(/.exec(match[1])?.[1];
        if (name) result.set(name, match[1].replace(/\s+/g, ' ').trim());
    }
    return result;
}
const oldText = headers('vendor/box3d/old-core-review');
const newText = headers('vendor/box3d/core');
const old = declarations(oldText),
    current = declarations(newText);
const binding = readFileSync(resolve(root, 'vendor/box3d/binding-base/src/bindings.cpp'), 'utf8');
const removed = [...old.keys()].filter((name) => !current.has(name));
const output = {
    schemaVersion: 1,
    scope: 'Public B3_API declarations only; review also includes structs/enums/callbacks in abi-review.md. Not compile/runtime proof.',
    oldCommit: '8441b4a06d6d09dcfb0b0f704df4d847d1437b92',
    targetCommit: 'efca0c184d40fd6a82016983f1601c4d23965867',
    aheadCommits: 40,
    headerInputHashes: { old: sha256(oldText), target: sha256(newText), binding: sha256(binding) },
    removed,
    added: [...current.keys()].filter((name) => !old.has(name)),
    changed: [...old.keys()]
        .filter((name) => current.has(name) && old.get(name) !== current.get(name))
        .map((name) => ({ name, old: old.get(name), target: current.get(name) })),
    removedSymbolsReferencedByOldBinding: removed.filter((name) => new RegExp(`\\b${name}\\b`).test(binding)),
};
const target = resolve(root, 'tools/physics/box3d/abi-diff.json');
const data = JSON.stringify(output, null, 2) + '\n';
if (process.argv.includes('--write')) writeFileSync(target, data);
else if (readFileSync(target, 'utf8') !== data) throw new Error('ABI source comparison drift; review and regenerate');
console.log(
    JSON.stringify(
        {
            removed: removed.length,
            added: output.added.length,
            changed: output.changed.length,
            staleBindingReferences: output.removedSymbolsReferencedByOldBinding,
        },
        null,
        2,
    ),
);
