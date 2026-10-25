/** Independent event-aligned diagnostics; new-run observations, never historical reproduction evidence. */
import { createWallContactDiagnostics, WALL_CONTACT_DIAGNOSTICS } from './wall-contact-diagnostics.mjs';
const integer = (v) => Number.isSafeInteger(v) && v >= 0;
const frozen = (v) =>
    v && Object.isFrozen(v) && Object.values(v).every((x) => !x || typeof x !== 'object' || frozen(x));
export function createOrderAnchoredWallContactDiagnostics({ enabled = false, context, orderContext }) {
    let anchor = null,
        snapshotIdentity = null,
        sessionIdentity = null,
        round = null;
    let status = 'awaiting-accepted-O2',
        reason = null,
        prepared = null,
        lastPrepared = null,
        preAnchorRecoveryCount = 0;
    const records = [];
    const fail = (why) => {
        status = 'failed-closed';
        reason = why;
        prepared = null;
    };
    const guarded =
        (callback) =>
        (...args) => {
            if (!enabled || status === 'failed-closed' || status === 'complete') return;
            try {
                callback(...args);
            } catch {
                fail('diagnostic-context-unavailable');
            }
        };
    const read = () =>
        structuredClone({
            version: 'ex09-wall-contact-order-anchored-1',
            qualification: 'DIAGNOSTIC_ONLY_BACKEND_SNAPSHOT',
            alignment: 'accepted-O2-snapshot-active-submitTick-plus-35-through-51',
            historicalReproduction: false,
            snapshotSemantics: WALL_CONTACT_DIAGNOSTICS,
            completeMeaning: 'window-collected-not-contact-or-game-pass',
            config: { enabled: enabled === true, firstOffset: 35, lastOffset: 51, capacity: 17 },
            status,
            reason,
            preAnchorRecoveryCount,
            anchor,
            records,
        });
    function valid(c) {
        if (!c || c.closed || c.resetting || (anchor && c.recovering)) return 'lifecycle-unavailable';
        if (!c.session || c.session !== sessionIdentity || c.roundGeneration !== round)
            return 'session-or-round-changed';
        if (anchor) {
            if (c.session.generation !== round || c.session.config.configVersion !== anchor.configVersion)
                return 'session-configuration-changed';
            if (c.session.snapshot !== snapshotIdentity) return 'snapshot-identity-changed';
            if (c.session.paused || c.session.recoveryPlan || c.session.state !== 'SHIPPING')
                return 'active-shipping-unavailable';
            if (
                anchor.itemRefs.some(
                    (ref) =>
                        c.items.filter((i) => i.itemId === ref.itemId && i.itemGeneration === ref.itemGeneration)
                            .length !== 1,
                )
            )
                return 'item-generation-changed';
        }
        return null;
    }
    return Object.freeze({
        acceptedSubmit: guarded((result, nativeTick) => {
            if (!enabled || status === 'failed-closed' || result?.accepted !== true) return;
            const c = orderContext(),
                s = c?.session,
                snap = result.snapshot;
            // The preceding first order is not a candidate. Never select a later O2 attempt.
            if (!anchor && s?.orderIndex === 0 && snap?.orderId === 'O1') return;
            if (anchor) {
                fail('duplicate-accepted-submission');
                return;
            }
            if (
                !s ||
                s.orderIndex !== 1 ||
                s.state !== 'SHIPPING' ||
                snap !== s.snapshot ||
                !frozen(snap) ||
                snap.orderId !== 'O2' ||
                s.config.orders[1]?.id !== 'O2' ||
                snap.configVersion !== s.config.configVersion ||
                snap.roundGeneration !== c.roundGeneration ||
                !integer(snap.attemptId) ||
                snap.attemptId < 1 ||
                snap.submitTick !== s.tick + 1 ||
                !integer(nativeTick) ||
                !Array.isArray(snap.itemRefs) ||
                snap.itemRefs.length !== 2 ||
                snap.itemRefs
                    .map((r) => r.itemId)
                    .sort()
                    .join(',') !== 'A2,C4' ||
                !snap.itemRefs.every((r) => integer(r.itemGeneration) && r.itemGeneration > 0)
            ) {
                fail('invalid-accepted-O2-anchor');
                return;
            }
            if (round !== null && (round !== c.roundGeneration || sessionIdentity !== s)) {
                fail('session-or-round-changed');
                return;
            }
            round = c.roundGeneration;
            sessionIdentity = s;
            snapshotIdentity = snap;
            anchor = Object.freeze({ ...structuredClone(snap), nativeSubmitTick: nativeTick });
            const error = valid(c);
            if (error) {
                fail(error);
                return;
            }
            status = 'armed';
        }),
        prepare: guarded((nativeTick) => {
            if (!enabled || status === 'failed-closed' || status === 'complete') return;
            const c = orderContext();
            if (round === null && c?.session) {
                round = c.roundGeneration;
                sessionIdentity = c.session;
            }
            const error = valid(c);
            if (error) {
                fail(error);
                return;
            }
            if (!anchor) return;
            if (
                !integer(nativeTick) ||
                (lastPrepared === null && nativeTick !== anchor.nativeSubmitTick) ||
                (lastPrepared !== null && nativeTick !== lastPrepared + 1) ||
                prepared
            ) {
                fail('non-contiguous-native-step');
                return;
            }
            const offset = nativeTick - anchor.nativeSubmitTick;
            const activeTick = c.session.tick + 1;
            if (offset < 0 || activeTick !== anchor.submitTick + offset) {
                fail('active-native-alignment-changed');
                return;
            }
            lastPrepared = nativeTick;
            if (offset > 51) {
                fail('missed-relative-window');
                return;
            }
            if (offset < 35) return;
            prepared = {
                nativeTick,
                activeTick,
                offset,
                recorder: createWallContactDiagnostics({
                    enabled: true,
                    startTick: nativeTick,
                    endTick: nativeTick,
                    capacity: 1,
                    context,
                }),
            };
        }),
        onCollision: guarded((nativeTick, self, event) => {
            if (!prepared || status === 'failed-closed') return;
            const error = valid(orderContext());
            if (error) {
                fail(error);
                return;
            }
            if (nativeTick !== prepared.nativeTick) {
                fail('collision-step-mismatch');
                return;
            }
            prepared.recorder.onCollision(nativeTick, self, event);
        }),
        capture: guarded((nativeTick) => {
            if (!enabled || !anchor || status === 'failed-closed' || status === 'complete') return;
            const c = orderContext(),
                error = valid(c);
            if (error) {
                fail(error);
                return;
            }
            if (!prepared) return;
            if (nativeTick !== prepared.nativeTick || c.session.tick + 1 !== prepared.activeTick) {
                fail('completed-step-alignment-changed');
                return;
            }
            const { recorder, activeTick, offset } = prepared;
            recorder.capture(nativeTick);
            records.push({
                ...recorder.read().records[0],
                activeTick,
                relativeSubmitTick: offset,
                anchor: structuredClone(anchor),
                orderAttemptId: anchor.attemptId,
                observedRoundGeneration: c.roundGeneration,
                observedItemGenerations: c.items
                    .filter((i) => anchor.itemRefs.some((r) => r.itemId === i.itemId))
                    .map((i) => ({ itemId: i.itemId, itemGeneration: i.itemGeneration })),
            });
            prepared = null;
            if (offset === 51) {
                if (records.length !== 17) fail('incomplete-relative-window');
                else status = 'complete';
            }
        }),
        invalidate: guarded((why) => {
            if (!anchor && why === 'accepted-recovery') {
                preAnchorRecoveryCount++;
                return;
            }
            if (anchor || round !== null) fail(why);
        }),
        read,
        reportFields: () =>
            enabled
                ? {
                      wallContactOrderAnchoredDiagnostics: {
                          reportExtensionSchema: 'ex09-order-anchored-diagnostic-report-extension-1',
                          provenance: 'opt-in-order-anchored-new-run-not-original-C4-evidence',
                          ...read(),
                      },
                  }
                : {},
    });
}
