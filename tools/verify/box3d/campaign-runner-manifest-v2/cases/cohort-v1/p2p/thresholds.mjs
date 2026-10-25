/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Freeze before real execution. Failed attempts do not authorize loosening or skipping these bounds.
export const thresholds = Object.freeze({
    fixedDtSeconds: 1 / 60,
    solverSubSteps: 4,
    enduranceTicks: 600,
    separationMetres: 0.02,
    captureMetres: 0.0001,
    rotationTicks: 90,
    rotationMinimumRadians: 0.2,
    rotationAxisAlignmentMinimum: 0.99,
    freeAngularSpeedMinimum: 0.1,
    angularSpeedRetentionMinimum: 0.8,
    angularSpeedRetentionMaximum: 1.2,
    translationMinimumMetres: 0.05,
    disabledTicks: 20,
});
export const unrunGates = Object.freeze({
    ordinaryBrowserLoading: 'NOT_RUN',
    browserGraphicsAndShutdown: 'NOT_RUN',
    nativeAllocationAccounting: 'NOT_RUN',
    fullT17: 'NOT_RUN',
    fullEX09: 'NOT_RUN',
    full2128CellMatrix: 'NOT_RUN',
    nineFormalGates: 'NOT_RUN',
    liveScaleMutationAndRecreation: 'NOT_RUN',
});
