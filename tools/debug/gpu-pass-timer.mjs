/** Tool-owned initialization window. Do not initialize unrelated devices concurrently. */
export async function withWebGPUTimingFeature(initialize) {
    if (typeof initialize !== 'function') throw Error('A device initialization callback is required');
    if (typeof GPUAdapter === 'undefined') return initialize();
    const prototype = GPUAdapter.prototype;
    const original = prototype.requestDevice;
    const wrapped = function (descriptor = {}) {
        const features = new Set(descriptor.requiredFeatures || []);
        if (this.features.has('timestamp-query')) features.add('timestamp-query');
        return original.call(this, { ...descriptor, requiredFeatures: [...features] });
    };
    prototype.requestDevice = wrapped;
    try {
        return await initialize();
    } finally {
        if (prototype.requestDevice === wrapped) prototype.requestDevice = original;
    }
}

/** Opt-in native WebGPU timing. Not imported by the engine/runtime bundle.
 * Use timer.createCommandEncoder()/submit() for measured work. No global patches.
 * Copy commands between timestamped passes contribute to span, never to pass sum.
 */
export function createWebGPUPassTimer(device, { capacity = 32 } = {}) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 128) throw Error('Invalid GPU timer capacity');
    const supported = !!device?.features.has('timestamp-query');
    const slots = [],
        regions = [],
        passes = [],
        waiting = new Set(),
        commands = new WeakMap();
    let disposed = false,
        lost = false,
        submission = 0,
        passSequence = 0;
    const unavailable = (reason) => ({ status: 'unavailable', reason, ms: null });
    const state = () =>
        disposed ? 'disposed' : lost ? 'device-lost' : !supported ? 'timestamp-query-not-enabled' : null;
    const invalidate = (reason) => {
        for (const row of passes) if (row.status === 'pending') Object.assign(row, unavailable(reason));
        for (const slot of slots) {
            slot.query.destroy();
            slot.resolve.destroy();
            slot.read.destroy();
        }
        slots.length = 0;
    };
    device?.lost?.then(() => {
        if (!disposed) {
            lost = true;
            invalidate('device-lost');
        }
    });
    const activeRegions = () => regions.filter((region) => !region.closed);
    function reserve() {
        let slot = slots.find((value) => !value.busy);
        if (!slot && slots.length < capacity) {
            const owned = [];
            try {
                const query = device.createQuerySet({ type: 'timestamp', count: 2 });
                owned.push(query);
                const resolve = device.createBuffer({
                    size: 16,
                    usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
                });
                owned.push(resolve);
                const read = device.createBuffer({
                    size: 16,
                    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
                });
                owned.push(read);
                slot = { query, resolve, read, busy: false };
                slots.push(slot);
            } catch (error) {
                for (const resource of owned.reverse()) resource.destroy();
                throw error;
            }
        }
        if (slot) slot.busy = true;
        return slot;
    }
    function createCommandEncoder(descriptor) {
        if (disposed || lost) throw Error(state());
        const encoder = device.createCommandEncoder(descriptor);
        const rows = [],
            leases = [];
        for (const [method, type] of [
            ['beginRenderPass', 'render'],
            ['beginComputePass', 'compute'],
        ]) {
            const original = encoder[method].bind(encoder);
            encoder[method] = (description = {}) => {
                const members = activeRegions();
                if (!members.length) return original(description);
                const row = { id: ++passSequence, label: description.label || type, type, status: 'pending', ms: null };
                passes.push(row);
                rows.push(row);
                for (const region of members) region.rows.push(row);
                const reason = state() || (description.timestampWrites ? 'timestamp-owner-conflict' : null);
                if (reason) {
                    Object.assign(row, unavailable(reason));
                    return original(description);
                }
                let slot;
                try {
                    slot = reserve();
                } catch (error) {
                    Object.assign(row, unavailable('query-allocation-failed'), { error: String(error) });
                    return original(description);
                }
                if (!slot) {
                    Object.assign(row, unavailable('query-capacity-exhausted'));
                    return original(description);
                }
                try {
                    const pass = original({
                        ...description,
                        timestampWrites: {
                            querySet: slot.query,
                            beginningOfPassWriteIndex: 0,
                            endOfPassWriteIndex: 1,
                        },
                    });
                    leases.push({ slot, row });
                    return pass;
                } catch (error) {
                    slot.busy = false;
                    Object.assign(row, unavailable('pass-encoding-failed'));
                    throw error;
                }
            };
        }
        const finish = encoder.finish.bind(encoder);
        encoder.finish = (description) => {
            try {
                if (disposed || lost) throw Error(state());
                for (const { slot } of leases) {
                    encoder.resolveQuerySet(slot.query, 0, 2, slot.resolve, 0);
                    encoder.copyBufferToBuffer(slot.resolve, 0, slot.read, 0, 16);
                }
                const command = finish(description);
                commands.set(command, { rows, leases });
                return command;
            } catch (error) {
                for (const { slot, row } of leases) {
                    slot.busy = false;
                    Object.assign(row, unavailable('command-encoding-failed'));
                }
                throw error;
            }
        };
        return encoder;
    }
    function abandon(command) {
        const batch = commands.get(command);
        if (!batch) return;
        commands.delete(command);
        for (const { slot, row } of batch.leases) {
            slot.busy = false;
            Object.assign(row, unavailable('command-abandoned'));
        }
    }
    function submit(buffers) {
        const list = Array.from(buffers);
        if (disposed || lost) {
            for (const command of list) abandon(command);
            throw Error(state());
        }
        const id = ++submission;
        try {
            device.queue.submit(list);
        } catch (error) {
            for (const command of list) abandon(command);
            throw error;
        }
        for (const command of list) {
            const batch = commands.get(command);
            if (!batch) continue;
            commands.delete(command);
            for (const row of batch.rows) row.submissionId = id;
            for (const { slot, row } of batch.leases) {
                const completion = (async () => {
                    try {
                        await slot.read.mapAsync(GPUMapMode.READ);
                        if (state()) {
                            Object.assign(row, unavailable(state()));
                            return;
                        }
                        const values = new BigUint64Array(slot.read.getMappedRange());
                        const begin = values[0],
                            end = values[1];
                        if (end < begin) {
                            Object.assign(row, unavailable('invalid-timestamp-order'));
                            return;
                        }
                        Object.assign(row, {
                            status: 'measured',
                            ms: Number(end - begin) / 1e6,
                            beginTimestampNs: String(begin),
                            endTimestampNs: String(end),
                            resultObservedAtMs: performance.now(),
                        });
                    } catch (error) {
                        Object.assign(row, unavailable(state() || 'timestamp-map-failed'), { error: String(error) });
                    } finally {
                        if (!state()) slot.read.unmap();
                        slot.busy = false;
                    }
                })();
                waiting.add(completion);
                completion.finally(() => waiting.delete(completion));
            }
        }
        return id;
    }
    return {
        get state() {
            return state() ? unavailable(state()) : { status: 'available', feature: 'timestamp-query' };
        },
        begin({ regionId, frame }) {
            if (disposed || lost) return unavailable(state());
            if (typeof regionId !== 'string' || !regionId || !Number.isSafeInteger(frame) || frame < 0)
                throw Error('GPU region requires regionId and nonnegative frame');
            if (regions.length >= 128) return unavailable('region-capacity-exhausted');
            if (regions.some((region) => region.regionId === regionId))
                throw Error('GPU region identity already exists');
            const token = Object.freeze({ regionId, frame });
            regions.push({ ...token, token, rows: [], closed: false, beginObservedAtMs: performance.now() });
            return token;
        },
        end(token) {
            const region = regions.find((value) => value.token === token);
            if (!region || region.closed) return;
            region.closed = true;
            region.endObservedAtMs = performance.now();
        },
        createCommandEncoder,
        submit,
        abandon,
        async flush() {
            await Promise.allSettled([...waiting]);
        },
        snapshot() {
            return {
                backend: 'webgpu',
                feature: 'timestamp-query',
                queryType: 'timestamp',
                passes: passes.map((row) => ({ ...row })),
                regions: regions.map((region) => {
                    const rows = region.rows;
                    const reason =
                        rows.find((row) => row.status === 'unavailable')?.reason ||
                        (!region.closed ? state() || 'region-open' : null);
                    const pending = rows.some((row) => row.status === 'pending');
                    const result = {
                        regionId: region.regionId,
                        frame: region.frame,
                        passIds: rows.map((row) => row.id),
                        submissionIds: [
                            ...new Set(rows.map((row) => row.submissionId).filter((id) => id !== undefined)),
                        ],
                        beginObservedAtMs: region.beginObservedAtMs,
                        endObservedAtMs: region.endObservedAtMs,
                    };
                    if (reason || !rows.length)
                        return { ...result, ...unavailable(reason || state() || 'no-timestamped-passes') };
                    if (pending) return { ...result, status: 'pending', ms: null };
                    const begin = rows.reduce(
                        (value, row) => (BigInt(row.beginTimestampNs) < value ? BigInt(row.beginTimestampNs) : value),
                        BigInt(rows[0].beginTimestampNs),
                    );
                    const end = rows.reduce(
                        (value, row) => (BigInt(row.endTimestampNs) > value ? BigInt(row.endTimestampNs) : value),
                        0n,
                    );
                    return {
                        ...result,
                        status: 'measured',
                        gpuPassSumMs: rows.reduce((sum, row) => sum + row.ms, 0),
                        gpuElapsedSpanMs: Number(end - begin) / 1e6,
                    };
                }),
            };
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            invalidate('disposed');
        },
    };
}
