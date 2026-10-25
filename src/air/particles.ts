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
import { Node } from '../cocos/scene-graph/node';
import { director } from '../cocos/game/director';
import { ParticleSystem } from '../cocos/particle/particle-system';
import ShapeModule from '../cocos/particle/emitter/shape-module';
import ColorOvertimeModule from '../cocos/particle/animator/color-overtime';
import SizeOvertimeModule from '../cocos/particle/animator/size-overtime';
import VelocityOvertimeModule from '../cocos/particle/animator/velocity-overtime';
import ForceOvertimeModule from '../cocos/particle/animator/force-overtime';
import LimitVelocityOvertimeModule from '../cocos/particle/animator/limit-velocity-overtime';
import RotationOvertimeModule from '../cocos/particle/animator/rotation-overtime';
import TextureAnimationModule from '../cocos/particle/animator/texture-animation';
import { NoiseModule } from '../cocos/particle/animator/noise-module';
import TrailModule from '../cocos/particle/renderer/trail';

export { ParticleSystem, ShapeModule };
export { CurveRange, GradientRange, Burst, ParticleUtils } from '../cocos/particle';
export { Mode as ParticleCurveMode } from '../cocos/particle/animator/curve-range';
export * from '../cocos/particle/enum';
export { TrailModule };
export {
    ColorOvertimeModule,
    SizeOvertimeModule,
    VelocityOvertimeModule,
    ForceOvertimeModule,
    LimitVelocityOvertimeModule,
    RotationOvertimeModule,
    TextureAnimationModule,
    NoiseModule,
};

export interface AirParticleOptions {
    parent: Node;
    name?: string;
    /** Defaults to CPU. GPU mode uses native analytical simulation, not arbitrary compute. */
    useGPU?: boolean;
    /** Runs on an inactive node, before native onLoad/onEnable. Do not activate the node here. */
    configure?: (system: ParticleSystem) => void;
}

/** Create and configure the native component without editor-serialized module objects. */
export function createAirParticleSystem(options: AirParticleOptions): ParticleSystem {
    if (!director.root) throw new Error('[AIR_PARTICLE_NOT_READY] Call createAirApp() before creating particles.');
    if (!options.parent.isValid) throw new Error('[AIR_PARTICLE_PARENT] A valid parent Node is required.');
    const node = new Node(options.name ?? 'Particles');
    node.active = false;
    const system = node.addComponent(ParticleSystem);
    try {
        system.shapeModule = new ShapeModule();
        system.colorOverLifetimeModule = new ColorOvertimeModule();
        system.sizeOvertimeModule = new SizeOvertimeModule();
        system.velocityOvertimeModule = new VelocityOvertimeModule();
        system.forceOvertimeModule = new ForceOvertimeModule();
        system.limitVelocityOvertimeModule = new LimitVelocityOvertimeModule();
        system.rotationOvertimeModule = new RotationOvertimeModule();
        system.textureAnimationModule = new TextureAnimationModule();
        system.noiseModule = new NoiseModule();
        system.trailModule = new TrailModule();
        // Native modules normally obtain these non-zero defaults from serialized assets.
        system.startSizeY.constant = system.startSizeZ.constant = 1;
        system.sizeOvertimeModule.size.constant = 1;
        system.sizeOvertimeModule.x.constant =
            system.sizeOvertimeModule.y.constant =
            system.sizeOvertimeModule.z.constant =
                1;
        system.velocityOvertimeModule.speedModifier.constant = 1;
        system.textureAnimationModule.numTilesX = system.textureAnimationModule.numTilesY = 1;
        system.trailModule.lifeTime.constant = system.trailModule.widthRatio.constant = 1;
        system.renderer.useGPU = options.useGPU ?? false;
        if (options.useGPU && !system.renderer.useGPU) {
            throw new Error('[AIR_PARTICLE_GPU_UNSUPPORTED] Native GPU particles are unavailable on this device.');
        }
        options.configure?.(system);
        if (
            system.renderer.useGPU &&
            (system.trailModule?.enable || system.noiseModule?.enable || system.limitVelocityOvertimeModule?.enable)
        ) {
            throw new Error('[AIR_PARTICLE_GPU_MODULE] Trails, noise and velocity limiting require CPU particles.');
        }
        if (node.active || node.parent) {
            throw new Error('[AIR_PARTICLE_CONFIGURATION] configure must leave the node inactive and unparented.');
        }
        options.parent.addChild(node);
        node.active = true;
        return system;
    } catch (error) {
        node.destroy();
        throw error;
    }
}
