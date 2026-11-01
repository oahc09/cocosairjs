/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Preserve opaque collider identity labels across node destruction, not changing numeric snapshot data.
export function createPublicQueryCopier() {
    const labels = new WeakMap();
    return (value) =>
        JSON.parse(
            JSON.stringify(value, (key, item) => {
                if (['collider', 'queryCollider'].includes(key) && item && typeof item === 'object') {
                    if (!labels.has(item)) labels.set(item, item.node?.name ?? '<unlabelled-collider>');
                    return labels.get(item);
                }
                return item;
            }),
        );
}
