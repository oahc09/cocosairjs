/**
 * `KHR_lights_punctual`: instantiate directional/point/spot lights as native components.
 *
 * Unit contract (glTF spec -> Cocos pipeline):
 *  - directional: intensity is illuminance in lux -> DirectionalLight.illuminance; the
 *    light shines along the node's local -Z, matching Cocos' directional convention.
 *  - point/spot: intensity is luminous intensity in candela, mapped to engine luminous
 *    flux (lumens) via the emitter solid angle: point flux = 4*PI*I; uniform-cone spot
 *    flux = 2*PI*(1-cos(outerConeAngle))*I (glTF outerConeAngle is the half angle).
 *    The luminousFlux setter/getter pair round-trips under both HDR and LDR exposure
 *    modes; Cocos has no inner-cone plateau, so innerConeAngle is retained as metadata
 *    with a warning. SpotLight.spotAngle takes the FULL cone angle in degrees.
 *  - Cocos light color is a 0-255 tint; glTF color is linear 0-1 and is carried directly
 *    (r*255 etc.) as the tint channel.
 *  - Missing `range` means unbounded range per spec. Cocos requires a finite range, so
 *    `INFINITE_RANGE` (a very large finite value, never a short one) is used.
 */
import { Color } from '../../../../../cocos/core/math';
import { DirectionalLight } from '../../../../../cocos/3d/lights/directional-light-component';
import { PointLight } from '../../../../../cocos/3d/lights/point-light-component';
import { SpotLight } from '../../../../../cocos/3d/lights/spot-light-component';
import type { Node } from '../../../../../cocos/scene-graph/node';
import { GLTFError } from '../../diagnostics';
import type { GLTFExtensionFactory, GLTFExtensionHandler, GLTFInstantiationContext } from '../../extension-registry';
import type { GLTFParserContext } from '../../parser-context';
import { check, item } from '../../schema';

export const KHR_LIGHTS_PUNCTUAL = 'KHR_lights_punctual';

/** Finite stand-in for glTF's unbounded light range (never a short arbitrary cutoff). */
export const INFINITE_RANGE = 100000;

export interface PunctualLightDef {
    name?: string;
    type: 'directional' | 'point' | 'spot';
    color?: [number, number, number];
    intensity?: number;
    range?: number;
    innerConeAngle?: number;
    outerConeAngle?: number;
}

interface LightsExt { lights?: PunctualLightDef[] }
interface NodeLightsExt { light?: number }

function lightDefsOf (json: GLTFParserContext['json']): PunctualLightDef[] | undefined {
    return (json.extensions?.[KHR_LIGHTS_PUNCTUAL] as LightsExt | undefined)?.lights;
}

function invalid (message: string): GLTFError {
    return new GLTFError('GLTF_EXTENSION_INVALID', message, KHR_LIGHTS_PUNCTUAL);
}

function validateDef (def: PunctualLightDef, index: number): void {
    const at = `KHR_lights_punctual light ${index}`;
    if (def.type !== 'directional' && def.type !== 'point' && def.type !== 'spot') { throw invalid(`${at}: invalid type`); }
    if (def.color !== undefined) {
        if (!(def.color.length === 3 && def.color.every((v) => Number.isFinite(v) && v >= 0 && v <= 1))) {
            throw invalid(`${at}: color must be linear [0,1]^3`);
        }
    }
    if (def.intensity !== undefined && !(Number.isFinite(def.intensity) && def.intensity >= 0)) {
        throw invalid(`${at}: intensity must be finite and non-negative`);
    }
    if (def.range !== undefined && !(Number.isFinite(def.range) && def.range > 0)) {
        throw invalid(`${at}: range must be positive when present`);
    }
    const inner = def.innerConeAngle ?? 0;
    const outer = def.outerConeAngle ?? Math.PI / 4;
    if (def.type === 'spot') {
        if (!(Number.isFinite(inner) && inner >= 0 && Number.isFinite(outer) && outer > inner && outer < Math.PI / 2)) {
            throw invalid(`${at}: cone angles require 0 <= inner < outer < PI/2`);
        }
    }
}

export function punctualLightsFactory (context: GLTFParserContext): GLTFExtensionHandler {
    return {
        name: KHR_LIGHTS_PUNCTUAL,
        support: () => ({ name: KHR_LIGHTS_PUNCTUAL, status: 'supported' }),
        validate (ctx): void {
            const defs = lightDefsOf(ctx.json);
            check(!defs || Array.isArray(defs), 'KHR_lights_punctual.lights must be an array');
            (defs || []).forEach(validateDef);
            for (const [nodeIndex, node] of (ctx.json.nodes || []).entries()) {
                const ext = node.extensions?.[KHR_LIGHTS_PUNCTUAL] as NodeLightsExt | undefined;
                if (ext?.light === undefined) { continue; }
                item(defs || [], ext.light, `node ${nodeIndex} light reference`);
            }
        },
        instantiate (nodeIndex: number, node: Node, ctx: GLTFInstantiationContext): void {
            const ext = ctx.json.nodes![nodeIndex].extensions?.[KHR_LIGHTS_PUNCTUAL] as NodeLightsExt | undefined;
            if (ext?.light === undefined) { return; }
            const def = item(lightDefsOf(ctx.json) || [], ext.light, 'light');
            validateDef(def, ext.light);
            const color = new Color(
                (def.color?.[0] ?? 1) * 255, (def.color?.[1] ?? 1) * 255, (def.color?.[2] ?? 1) * 255, 255);
            const intensity = def.intensity ?? 1;
            if (def.type === 'directional') {
                const light = node.addComponent(DirectionalLight);
                light.illuminance = intensity;
                light.color = color;
                if (def.range !== undefined) { context.warn(`node ${nodeIndex}: directional lights ignore range`); }
            } else if (def.type === 'point') {
                const light = node.addComponent(PointLight);
                light.luminousFlux = 4 * Math.PI * intensity;
                light.color = color;
                light.range = def.range ?? INFINITE_RANGE;
            } else {
                const outer = def.outerConeAngle ?? Math.PI / 4;
                const light = node.addComponent(SpotLight);
                light.spotAngle = (outer * 2) * 180 / Math.PI;
                light.luminousFlux = 2 * Math.PI * (1 - Math.cos(outer)) * intensity;
                light.color = color;
                light.range = def.range ?? INFINITE_RANGE;
                if ((def.innerConeAngle ?? 0) > 0) {
                    context.warn(`node ${nodeIndex}: innerConeAngle has no engine plateau input, retained as metadata`);
                }
            }
        },
    };
}

export const punctualLightsExtension: GLTFExtensionFactory = punctualLightsFactory;
