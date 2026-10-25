/** Actual same-tick contact graph; a cycle without a direct door seed cannot support an order. */
export function doorSupportedItems(items, tick) {
    const live = new Map(items.filter((i) => !i.held).map((i) => [`${i.itemId}:${i.itemGeneration}`, i]));
    const supported = new Set();
    for (let pass = 0; pass <= items.length; pass++) {
        let changed = false;
        for (const [key, item] of live) {
            if (supported.has(key)) continue;
            if (
                item.supportContacts.some(
                    (c) =>
                        c.tick === tick &&
                        c.points.some((p) => p.normal.y > 0.5) &&
                        (c.peer === 'door' || (live.has(c.peer) && supported.has(c.peer))),
                )
            ) {
                supported.add(key);
                changed = true;
            }
        }
        if (!changed) break;
    }
    return supported;
}
