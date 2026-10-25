/** Versioned explicit recovery extension. No user-supplied grant, pose or clock mutation. */
export const REPACK_ADMISSION = Object.freeze({
    version: 'strict-rejection-repack-1',
    command: 'repack-order',
    scope: 'one-use-per-authentic-strict-rejection',
    originalRetryUnchanged: true,
    physicalVerification: 'NOT_RUN',
});
export function deriveRepackProtocol(original) {
    if (original?.protocolVersion !== 'gift-workshop-input-1' || original.commands.some((c) => c.id === 'repack-order'))
        throw Error('Unsupported original repack protocol');
    const derived = structuredClone(original);
    derived.originalProtocolVersion = original.protocolVersion;
    derived.protocolVersion = 'gift-workshop-input-1+strict-repack-1';
    derived.envelopeSchema.properties.protocolVersion.const = derived.protocolVersion;
    if (Array.isArray(derived.envelopeSchema.properties.command.enum))
        derived.envelopeSchema.properties.command.enum.push('repack-order');
    const template = derived.commands.find((c) => c.id === 'recover-dropped');
    if (!template) throw Error('Missing original recovery command');
    derived.commands.push({
        ...structuredClone(template),
        id: 'repack-order',
        allowedStates: ['PACKING'],
        effect: 'Restore all unconsumed instances after a one-use authentic strict rejection. Invalidate old receipts, increment item generations and charge 300 ticks once; unlock only after complete physical readback.',
        description: 'One-use strict-rejection repack; real idle recovery and penalty required.',
    });
    derived.repackAdmission = REPACK_ADMISSION;
    return derived;
}
