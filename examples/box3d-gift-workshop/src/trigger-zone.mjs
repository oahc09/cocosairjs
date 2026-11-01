/** Real public sensor events provide candidates only. Geometry/support/velocity are separate gates. */
export class TriggerZone {
    constructor({ sensor, generation, getGeneration, getItems, getTick }) {
        Object.assign(this, { sensor, generation, getGeneration, getItems, getTick });
        this.children = new Map();
        this.events = [];
        this.tailEvents = [];
        this.droppedEvents = 0;
        this.boundaryEvents = [];
        this.droppedBoundaryEvents = 0;
        this.closed = false;
        this.handlers = new Map();
        for (const type of ['onTriggerEnter', 'onTriggerStay', 'onTriggerExit']) {
            const listener = (event) => this.onEvent(type, event);
            this.handlers.set(type, listener);
            sensor.on(type, listener);
        }
    }
    onEvent(type, event) {
        if (this.closed || this.generation !== this.getGeneration() || event.selfCollider !== this.sensor) return;
        const item = this.getItems().find((i) => i.colliders.includes(event.otherCollider));
        if (!item) return;
        const identity = `${item.itemId}:${item.itemGeneration}`;
        if (type === 'onTriggerExit') this.children.delete(event.otherCollider);
        else
            this.children.set(event.otherCollider, {
                identity,
                childIndex: item.colliders.indexOf(event.otherCollider),
                itemId: item.itemId,
                itemGeneration: item.itemGeneration,
                tick: this.getTick(),
            });
        const record = {
            type,
            tick: this.getTick(),
            generation: this.generation,
            itemId: item.itemId,
            itemGeneration: item.itemGeneration,
            childIndex: item.colliders.indexOf(event.otherCollider),
        };
        if (type !== 'onTriggerStay') {
            if (this.boundaryEvents.length < 512) this.boundaryEvents.push(record);
            else this.droppedBoundaryEvents++;
        }
        if (this.events.length < 1200) this.events.push(record);
        else this.droppedEvents++;
        this.tailEvents.push(record);
        if (this.tailEvents.length > 60) this.tailEvents.shift();
    }
    evidence(tick) {
        const live = new Set(this.getItems().map((i) => `${i.itemId}:${i.itemGeneration}`));
        return [...this.children.values()]
            .filter((v) => v.tick === tick && live.has(v.identity))
            .map((v) => ({ ...v, generation: this.generation }));
    }
    candidates(tick) {
        const live = new Map(this.getItems().map((i) => [`${i.itemId}:${i.itemGeneration}`, i]));
        return [
            ...new Set(
                [...this.children.values()]
                    .filter((v) => v.tick === tick && live.has(v.identity))
                    .map((v) => v.identity),
            ),
        ].map((key) => live.get(key));
    }
    invalidate(refs) {
        const keys = new Set(refs.map((r) => `${r.itemId}:${r.itemGeneration}`));
        for (const [collider, value] of this.children) if (keys.has(value.identity)) this.children.delete(collider);
        this.boundaryEvents.push({
            type: 'explicit-recovery-invalidation',
            tick: this.getTick(),
            generation: this.generation,
            refs: structuredClone(refs),
        });
    }
    dispose() {
        if (this.closed) return;
        for (const [type, listener] of this.handlers) this.sensor.off(type, listener);
        this.children.clear();
        this.closed = true;
    }
}
