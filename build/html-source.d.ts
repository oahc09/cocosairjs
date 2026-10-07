/** Experimental, engine-free opt-in entry. A native Texture2D is supplied by the caller. */
export interface AirHTMLTextureTarget {
    readonly width: number;
    readonly height: number;
    reset(info: {
        width: number;
        height: number;
        mipmapLevel: number;
    }): void;
    getGFXTexture(): unknown;
}
export interface AirHTMLSourceOptions {
    canvas: HTMLCanvasElement;
    element: HTMLElement;
    texture: AirHTMLTextureTarget;
    resolution?: number;
    autoUpdate?: boolean;
    snapshot?: boolean;
    onUpdate?: () => void;
    onError?: (error: unknown) => void;
}
export declare function getAirHTMLSourceSupport(canvas: HTMLCanvasElement): {
    supported: boolean;
    reason: string | null;
};
/** Uploads only on canvas paint events. Owns listeners/snapshots, borrows DOM and Texture2D. */
export declare function createAirHTMLSource(options: AirHTMLSourceOptions): {
    readonly texture: AirHTMLTextureTarget;
    readonly status: 'waiting' | 'ready' | 'failed' | 'disposed';
    readonly error: unknown;
    /** Queues a paint; upload completion is signalled by onUpdate/onError. */
    update(): void;
    updateGeometry(options: {
        canvasTransform?: DOMMatrixInit;
        clip?: DOMRectInit;
        preserveHitTestOrder?: boolean;
    }): void;
    dispose(): void;
};
