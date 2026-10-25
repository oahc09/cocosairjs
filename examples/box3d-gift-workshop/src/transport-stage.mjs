/**
 * Pure connection to OrderSession and WorkshopInput state. Not installed in main.ts.
 * It emits proposed targets only. A future qualified public bridge must query and
 * admit a target at the sanctioned engine boundary before marking motion admitted.
 */
import { transportBlockers } from './input.mjs';
import { planTransport, resolveTransport } from './transport-planner.mjs';
export function synchronizeTransportState({ session, input, intent, heldEpoch }) {
    const context = { state: session.state, paused: session.paused, roundGeneration: session.generation, heldEpoch };
    // Either admission or intent may originate a clear. Propagate the newer epoch;
    // never roll an intent-originated source-switch barrier backwards.
    const latest = Math.max(input.context.inputGeneration, intent.inputGeneration);
    if (input.context.inputGeneration < latest) {
        input.clear();
        input.context.inputGeneration = latest;
    }
    if (intent.inputGeneration < latest) {
        intent.clear('external-admission-barrier');
        intent.inputGeneration = latest;
    }
    const before = intent.inputGeneration;
    intent.synchronize(context);
    if (intent.inputGeneration !== before) input.clear();
    Object.assign(input.context, {
        state: session.state,
        paused: session.paused,
        roundGeneration: session.generation,
        tick: session.tick,
    });
    return context;
}
export function prepareTransportStage({
    session,
    input,
    intent,
    config,
    head,
    held,
    heldEpoch,
    snapshot,
    capabilities,
}) {
    synchronizeTransportState({ session, input, intent, heldEpoch });
    const missing = transportBlockers(capabilities);
    if (missing.length) return { ready: false, reason: 'qualified-public-transport-unavailable', missing };
    if (
        !snapshot ||
        snapshot.completedTick !== session.tick ||
        snapshot.roundGeneration !== session.generation ||
        !snapshot.token
    )
        return { ready: false, reason: 'committed-snapshot-not-current' };
    if (!['TUTORIAL', 'PACKING'].includes(session.state) || session.paused)
        return { ready: false, reason: 'transport-state-blocked' };
    const motion = intent.nextMotion(config);
    if (!motion.ready) return motion;
    const context = {
        tick: session.tick + 1,
        roundGeneration: session.generation,
        inputGeneration: input.context.inputGeneration,
        heldEpoch,
        snapshotToken: snapshot.token,
        state: session.state,
        paused: session.paused,
    };
    const plan = planTransport({ config, context, head, held, delta: motion.delta });
    return plan.ready ? { ready: true, plan, motion, fixedHz: config.judgement.fixedHz } : plan;
}
export function resolveTransportStage(stage, receipts, { session, input, heldEpoch, snapshot }) {
    if (!stage?.ready) return { ready: false, reason: stage?.reason ?? 'stage-not-prepared' };
    // Re-read session/epochs after query, rather than trusting the earlier state or body identity.
    const resolved = resolveTransport(stage.plan, receipts, {
        tick: session.tick + 1,
        roundGeneration: session.generation,
        inputGeneration: input.context.inputGeneration,
        heldEpoch,
        snapshotToken: snapshot?.token,
        state: session.state,
        paused: session.paused,
    });
    if (!resolved.ready) return resolved;
    return {
        ...resolved,
        kind: 'proposed-public-target-not-yet-admitted',
        tick: stage.plan.context.tick,
        roundGeneration: stage.plan.context.roundGeneration,
        inputGeneration: stage.plan.context.inputGeneration,
        heldEpoch,
        velocity: resolved.delta.map((v) => v * stage.fixedHz),
    };
}
