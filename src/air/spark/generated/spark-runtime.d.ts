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
/**
 * SPK-11 生成物：冻结 Spark 运行时子图（`vendor/spark/src/**` 经 esbuild 预打包）的类型边界。
 *
 * 边界说明（勿手改，改生成器 `tools/build/spark-runtime-tree.cjs`）：
 * - 运行时值全部来自冻结上游，本仓不重导出其 TS 类型面，以免 182 处上游类型错误进入本仓 tsc 程序
 *   （该接入形态的判定与证据见 `ai/ledgers/spark-integration.md` SPK-11 条目）；
 * - 相对上游 `index.ts` 的导出面已按 §SPK-10 收窄：剔除 `SparkXr` 与 `hands`（XR 会话/手部子图），
 *   复议条件同计划；生成期以 `metafile.inputs` 断言两者确实未进入子图；
 * - 此处标为 `any` 的符号即打包器在构建期校验过的运行时可用面，AIR 集成层按需再包一层带类型的门面。
 */
export declare const DISK_PORTAL_FRAGMENT_SHADER: any;
export type DISK_PORTAL_FRAGMENT_SHADER = any;
export declare const ExtSplats: any;
export type ExtSplats = any;
export declare const FpsMovement: any;
export type FpsMovement = any;
export declare const LN_SCALE_MAX: any;
export type LN_SCALE_MAX = any;
export declare const LN_SCALE_MIN: any;
export type LN_SCALE_MIN = any;
export declare const PackedSplats: any;
export type PackedSplats = any;
export declare const PagedSplats: any;
export type PagedSplats = any;
export declare const PointerControls: any;
export type PointerControls = any;
export declare const Readback: any;
export type Readback = any;
export declare const RgbaArray: any;
export type RgbaArray = any;
export declare const Sint8ToFloat: any;
export type Sint8ToFloat = any;
export declare const SparkControls: any;
export type SparkControls = any;
export declare const SparkPortals: any;
export type SparkPortals = any;
export declare const SparkRenderer: any;
export type SparkRenderer = any;
export declare const SplatAccumulator: any;
export type SplatAccumulator = any;
export declare const SplatEdit: any;
export type SplatEdit = any;
export declare const SplatEditRgbaBlendMode: any;
export type SplatEditRgbaBlendMode = any;
export declare const SplatEditSdf: any;
export type SplatEditSdf = any;
export declare const SplatEditSdfType: any;
export type SplatEditSdfType = any;
export declare const SplatEdits: any;
export type SplatEdits = any;
export declare const SplatFileType: any;
export type SplatFileType = any;
export declare const SplatGenerator: any;
export type SplatGenerator = any;
export declare const SplatLoader: any;
export type SplatLoader = any;
export declare const SplatMesh: any;
export type SplatMesh = any;
export declare const SplatModifier: any;
export type SplatModifier = any;
export declare const SplatPager: any;
export type SplatPager = any;
export declare const SplatSkinning: any;
export type SplatSkinning = any;
export declare const SplatSkinningMode: any;
export type SplatSkinningMode = any;
export declare const SplatTransformer: any;
export type SplatTransformer = any;
export declare const Uint8ToFloat: any;
export type Uint8ToFloat = any;
export declare const constructAxes: any;
export type constructAxes = any;
export declare const constructGrid: any;
export type constructGrid = any;
export declare const constructSpherePoints: any;
export type constructSpherePoints = any;
export declare const flipPixels: any;
export type flipPixels = any;
export declare const floatToSint8: any;
export type floatToSint8 = any;
export declare const floatToUint8: any;
export type floatToUint8 = any;
export declare const fromHalf: any;
export type fromHalf = any;
export declare const getSplatFileType: any;
export type getSplatFileType = any;
export declare const imageSplats: any;
export type imageSplats = any;
export declare const isAndroid: any;
export type isAndroid = any;
export declare const isIos: any;
export type isIos = any;
export declare const isMobile: any;
export type isMobile = any;
export declare const isOculus: any;
export type isOculus = any;
export declare const isQuest2: any;
export type isQuest2 = any;
export declare const isVisionPro: any;
export type isVisionPro = any;
export declare const pixelsToPngUrl: any;
export type pixelsToPngUrl = any;
export declare const readRgbaArray: any;
export type readRgbaArray = any;
export declare const setPackedSplat: any;
export type setPackedSplat = any;
export declare const textSplats: any;
export type textSplats = any;
export declare const toHalf: any;
export type toHalf = any;
export declare const transcodeSpz: any;
export type transcodeSpz = any;
export declare const unpackSplat: any;
export type unpackSplat = any;
export declare const writeSpz: any;
export type writeSpz = any;
export declare const defines: Record<string, any>;
export declare const dyno: Record<string, any>;
export declare const generators: Record<string, any>;
export declare const modifiers: Record<string, any>;
export declare const utils: Record<string, any>;
