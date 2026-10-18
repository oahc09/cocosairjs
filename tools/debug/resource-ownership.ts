import { isValid } from 'cocosair';

export interface ResourceObservation {
    label: string;
    ownership: 'owned' | 'shared';
    cleanupCompleted: boolean;
    queuedForDestroy: boolean;
    objectValid: boolean;
    gfxReleased: boolean | null;
    cacheRetained: boolean | null;
    errors: string[];
}

/** Read-only debug observation. Unknown backend/cache state stays null, never becomes PASS. */
export function observeResource(options: {
    label: string;
    resource: object;
    ownership: 'owned' | 'shared';
    cleanupCompleted: boolean;
    gfxReleased?: () => boolean;
    cacheRetained?: () => boolean;
}): ResourceObservation {
    const errors: string[] = [];
    const read = (probe?: () => boolean): boolean | null => {
        if (!probe) return null;
        try {
            const result = probe();
            if (typeof result !== 'boolean') throw new Error('probe must return boolean');
            return result;
        } catch (error) {
            errors.push(String(error));
            return null;
        }
    };
    const objectValid = isValid(options.resource);
    return {
        label: options.label,
        ownership: options.ownership,
        cleanupCompleted: options.cleanupCompleted,
        queuedForDestroy: objectValid && !isValid(options.resource, true),
        objectValid,
        gfxReleased: read(options.gfxReleased),
        cacheRetained: read(options.cacheRetained),
        errors,
    };
}

/** Call only after engine settlement; shared survivors are expected, not leaks. */
export function assertResourceOwnership(rows: readonly ResourceObservation[]): void {
    for (const row of rows) {
        if (row.errors.length) throw new Error(`${row.label}: observation failed: ${row.errors.join('; ')}`);
        if (row.ownership === 'shared') {
            if (!row.objectValid || row.queuedForDestroy || row.gfxReleased === true)
                throw new Error(`${row.label}: shared resource was destroyed`);
        } else if (!row.cleanupCompleted || row.objectValid || row.queuedForDestroy || row.gfxReleased === false) {
            throw new Error(`${row.label}: owned resource was not released`);
        }
    }
}
