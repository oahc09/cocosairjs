/**
 * @packageDocumentation
 * @hidden
 */

import { WebGPUDevice } from '../cocos/gfx/webgpu/webgpu-device';
import { legacyCC } from '../cocos/core/global-exports';

// Implementation registration only; the public API remains gfx.Device.
export {};
legacyCC.WebGPUDevice = WebGPUDevice;
