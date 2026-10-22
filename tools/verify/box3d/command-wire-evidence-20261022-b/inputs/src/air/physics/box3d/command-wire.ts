/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/
/** Internal value bridge only. The owner supplies an already queue-owned immutable
 * candidate and a private Map from logical bodies to existing opaque capabilities.
 * Neither structural checks nor Object.freeze authenticate a candidate, actual token,
 * world/generation ownership, or the correctness of the owner's body-to-token mapping.
 * The owner must keep the map stable, validate those obligations and the transaction
 * fence/readiness, and pass only its current queue candidate to the binding. Arbitrary
 * Map implementations/JavaScript are not sandboxed here. No native call, reduction,
 * target/lifetime decision, queue retirement, scene synchronization or public API.
 */
import type { Box3DCommand, Box3DId, Box3DOriginPose } from './binding/facade.mjs';
import type { CommandCandidate, CommandPose, CommandRecord, CommandVector } from './command-queue';

function fail(message: string): never {
    throw new Error(`Box3D command wire: ${message}`);
}
function positiveSequence(value: number | null): value is number {
    return Number.isSafeInteger(value) && value !== null && value > 0;
}
function vector(value: CommandVector | undefined): readonly number[] {
    if (value === undefined || value === null || typeof value !== 'object') fail('expected copied vector');
    const result = [value.x, value.y, value.z];
    if (result.some((component) => typeof component !== 'number' || !Number.isFinite(component)))
        fail('expected finite copied coordinates');
    // Preserve JS numbers, including -0. Float32/derived arithmetic admission belongs
    // to the binding/native planner, not this logical mapper.
    return Object.freeze(result);
}
function pose(value: CommandPose): Box3DOriginPose {
    if (!value || typeof value !== 'object') fail('expected copied pose');
    const position = vector(value.position),
        r = value.rotation;
    if (!r || typeof r !== 'object') fail('expected copied rotation');
    const rotation = [r.x, r.y, r.z, r.w];
    if (rotation.some((component) => typeof component !== 'number' || !Number.isFinite(component)))
        fail('expected finite copied rotation');
    return Object.freeze({ position, rotation: Object.freeze(rotation) });
}
function space(value: 'world' | 'local' | undefined): 'world' | 'local' {
    if (value !== 'world' && value !== 'local') fail('expected copied command space');
    return value;
}
function row(record: CommandRecord, body: Box3DId, sequence: number): Box3DCommand {
    const command = record.command,
        base = { body, sequence };
    switch (command.kind) {
        case 'force':
        case 'impulse':
            return Object.freeze({
                ...base,
                kind: command.kind === 'force' ? 'force' : 'linearImpulse',
                value: vector(command.vector),
                offset: vector(command.relativePoint),
                space: space(command.space),
            });
        case 'torque':
        case 'angular-impulse':
            return Object.freeze({
                ...base,
                kind: command.kind === 'torque' ? 'torque' : 'angularImpulse',
                value: vector(command.vector),
                space: space(command.space),
            });
        case 'teleport':
            if (typeof command.preserveVelocity !== 'boolean' || typeof command.wake !== 'boolean')
                fail('expected explicit copied teleport booleans');
            return Object.freeze({
                ...base,
                kind: 'reset',
                pose: pose(command.pose),
                mode: 'teleport',
                preserveVelocity: command.preserveVelocity,
                wake: command.wake,
            });
        case 'target':
            return Object.freeze({ ...base, kind: 'target', pose: pose(command.pose) });
        case 'target-clear':
            return Object.freeze({
                ...base,
                kind: 'pairedClear',
                reason: record.source === 'idle' ? 'idle' : record.source === 'protected' ? 'cleanup' : 'user',
            });
        case 'clear-forces':
            return Object.freeze({ ...base, kind: 'clearForces' });
        case 'clear-velocity':
            return Object.freeze({ ...base, kind: 'clearVelocity' });
        case 'clear-state':
            return Object.freeze({ ...base, kind: 'clearState' });
        default:
            return fail('unknown copied command kind');
    }
}

/** One-to-one mapping of the already reduced operation view. No receipt/authority is
 * returned, and original accepted records are neither read nor changed. A failure
 * throws without returning a partial result or changing the candidate or private map.
 * Tokens are retained by object identity, never read, cloned, reconstructed or frozen.
 */
export function mapCommandCandidate(
    candidate: CommandCandidate,
    bodyTokens: ReadonlyMap<object, Box3DId>,
): readonly Box3DCommand[] {
    if (!positiveSequence(candidate.generation) || !positiveSequence(candidate.context.tickIndex))
        fail('invalid candidate generation or tick');
    const tokens = new Map<object, Box3DId>(),
        identities = new Map<Box3DId, object>(),
        commands: Box3DCommand[] = [];
    let previousSequence = 0;
    for (const record of candidate.operations) {
        if (record.generation !== candidate.generation || record.tickIndex !== candidate.context.tickIndex)
            fail('record generation or tick does not match candidate');
        if (record.body === null || typeof record.body !== 'object') fail('expected logical body identity');
        const body = bodyTokens.get(record.body);
        if (body === undefined || body === null || typeof body !== 'object') fail('missing mapped body capability');
        if (tokens.has(record.body) && tokens.get(record.body) !== body) fail('logical body mapping changed');
        if (identities.has(body) && identities.get(body) !== record.body)
            fail('different logical bodies share a mapped capability');
        tokens.set(record.body, body);
        identities.set(body, record.body);
        let sequence: number;
        if (record.source === 'user' || record.source === 'producer') {
            if (!positiveSequence(record.sequence) || record.sequence <= previousSequence)
                fail('user/producer sequences must strictly increase');
            sequence = record.sequence;
            previousSequence = sequence;
        } else if (record.source === 'idle' || record.source === 'protected') {
            if (record.sequence !== null || record.command.kind !== 'target-clear')
                fail('internal zero requires a sequence-null target-clear');
            sequence = 0;
        } else fail('unknown record source');
        commands.push(row(record, body, sequence));
    }
    return Object.freeze(commands);
}
