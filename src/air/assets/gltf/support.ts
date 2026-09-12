/** Public extension support reporting types. */
export type GLTFExtensionStatus = 'supported' | 'decoder-required' | 'device-dependent' | 'fallback' | 'unsupported';

export interface GLTFExtensionSupport {
    name: string;
    status: GLTFExtensionStatus;
    reason?: string;
}
