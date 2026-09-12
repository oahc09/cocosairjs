export { GLTFAsset } from './asset';
export type { GLTFInstance } from './asset';
export { GLTFLoader, registerGLTFLoader } from './loader';

import { registerGLTFLoader } from './loader';
registerGLTFLoader();
