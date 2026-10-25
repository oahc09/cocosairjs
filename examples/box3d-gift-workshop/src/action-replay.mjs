/** Visible bounded input scheduler. No body, receipt, clock or pose mutation access. */
export function parseReplay(text) {
    const rows = JSON.parse(text);
    if (!Array.isArray(rows) || !rows.length || rows.length > 512) throw Error('需要 1–512 条动作');
    let previous = -1;
    for (const r of rows) {
        if (
            !r ||
            Object.keys(r).sort().join() !== 'at,command,payload' ||
            !Number.isSafeInteger(r.at) ||
            r.at <= previous ||
            r.at > 10800
        )
            throw Error('at 必须是严格递增的 0–10800 固定步偏移');
        previous = r.at;
        if (
            ![
                'set-axes',
                'attach-release',
                'submit-order',
                'recover-dropped',
                'retry-order',
                'clear-channel',
                'repack-order',
            ].includes(r.command)
        )
            throw Error('动作不在输入 allowlist');
        const p = r.payload;
        if (!p || Array.isArray(p) || typeof p !== 'object') throw Error('无效 payload');
        if (r.command === 'set-axes') {
            if (
                Object.keys(p).sort().join() !== 'x,y,z' ||
                Object.values(p).some((v) => !Number.isFinite(v) || Math.abs(v) > 1)
            )
                throw Error('方向必须在 [-1,1]');
        } else if (Object.keys(p).length) throw Error('该动作 payload 必须为空');
    }
    return structuredClone(rows);
}
// Admission to the visible panel is not command admission: every row still
// travels through applyActions and its current state/epoch checks.
export function validateReplayStart(text, state, recoveryPending = false) {
    const rows = parseReplay(text);
    if (recoveryPending) throw Error('恢复尚未完成，不能启动新回放');
    if (state === 'PACKING') return rows;
    const recovery = { BLOCKED: 'retry-order', CLOSING: 'clear-channel' }[state];
    if (!recovery || rows[0].at !== 0 || rows[0].command !== recovery)
        throw Error('当前状态仅允许以对应恢复命令开始回放');
    return rows;
}
export class ActionReplay {
    constructor({ send, readAck, onStop }) {
        Object.assign(this, { send, readAck, onStop });
        this.runs = [];
        this.current = null;
    }
    start(text, activeTick, generation) {
        if (this.current?.status === 'RUNNING') throw Error('请先取消当前回放');
        if (this.runs.length >= 32) throw Error('本页回放记录上限 32，请导出后重载');
        const script = parseReplay(text);
        this.current = {
            script,
            armedActiveTick: activeTick,
            startActiveTick: null,
            generation,
            status: 'RUNNING',
            cursor: 0,
            records: [],
        };
        this.runs.push(this.current);
    }
    stop(reason, status = 'STOPPED') {
        if (this.current?.status !== 'RUNNING') return;
        for (const record of this.current.records) {
            const ack = this.readAck(record.packet.seq);
            if (ack) record.latestAck = structuredClone(ack);
        }
        Object.assign(this.current, { status, reason });
        this.onStop(reason);
    }
    step(activeTick, generation, paused, state) {
        const r = this.current;
        if (r?.status !== 'RUNNING' || paused) return;
        if (generation !== r.generation || state === 'RESULT') return this.stop('round-boundary');
        for (const record of r.records) {
            const ack = this.readAck(record.packet.seq);
            record.latestAck = structuredClone(ack);
            if (ack?.accepted === false) return this.stop('rejected-ack');
        }
        if (r.startActiveTick === null) r.startActiveTick = activeTick;
        const row = r.script[r.cursor],
            elapsed = activeTick - r.startActiveTick;
        if (!row) {
            if (elapsed > r.script.at(-1).at) this.stop('script-ended-not-business-success', 'FINISHED');
            return;
        }
        if (elapsed < row.at) return;
        if (elapsed !== row.at) return this.stop('missed-active-tick');
        const result = this.send(row.command, structuredClone(row.payload));
        r.records.push({ activeTick, offset: elapsed, ...structuredClone(result) });
        r.cursor++;
        if (result.ack?.accepted !== true) this.stop('rejected-ack');
    }
    snapshot() {
        return structuredClone(this.runs);
    }
}
