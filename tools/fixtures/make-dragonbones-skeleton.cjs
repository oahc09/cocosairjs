/**
 * LV12-11 资产生成器：手写、许可干净的 DragonBones 骨架 + 图集（`examples/dragonbones-basic/assets/`）。
 *
 * 为什么自己生成而不是取第三方龙骨示例：计划书 LV12-11 的合同是「资产运行时构造 + 动画播放」，
 * 判定只需要 DragonBones 5.5 数据格式本身；引入第三方 `.json/.png` 会把许可面带进仓库。
 * 配方与 `tools/fixtures/make-tone-wav.cjs`、`make-video-mp4.cjs`、`gen-geometry-fixtures.cjs` 同族。
 *
 * 键名不是凭记忆写的：全部对照 vendored `@cocos/dragonbones-js@1.0.2`
 * （`src/node_modules/@cocos/dragonbones-js/out/dragonBones.js`）里
 * `ObjectDataParser.prototype.parseDragonBonesData` / `.parseTextureAtlasData` 实际读取的
 * `DataParser.*` 常量（armature/bone/slot/skin/display/animation/translateFrame/rotateFrame/
 * displayFrame/duration/SubTexture/imagePath/frameX…），并已由
 * `E:/AIProMax/cocosair-scratch/db-probe/db-fixture-probe.mjs` 在 node 侧解析验证。
 *
 * 三个 region 取纯色系（plate=绿 / wing=蓝 / tip=红），使「帧缓冲里出现哪种颜色」直接等价于
 * 「采样到了哪个 SubTexture」——示例合同据此判定 display 换图真的生效，而不是靠肉眼看出图。
 *
 * 用法：`node tools/fixtures/make-dragonbones-skeleton.cjs [--out=<dir>]`
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const REPO = path.resolve(__dirname, '../..');
const argOut = process.argv.find((a) => a.startsWith('--out='));
const OUT_DIR = argOut ? argOut.slice('--out='.length) : path.join(REPO, 'examples', 'dragonbones-basic', 'assets');

const NAME = 'AirDragon';
const ATLAS_SIZE = 64;
const FRAME_RATE = 24;

// ---------------------------------------------------------------- 图集区域
const REGIONS = [
    { name: 'plate', x: 2, y: 2, w: 20, h: 20, rgb: [0, 255, 0] },
    { name: 'wing', x: 26, y: 2, w: 20, h: 20, rgb: [0, 120, 255] },
    { name: 'tip', x: 2, y: 26, w: 12, h: 28, rgb: [255, 0, 0] },
];
// 背景用高饱和品红：任何「未命中 region」的采样点都不会与三种内容色混淆。
const BACKGROUND = [255, 0, 255];

function crc32 (bytes) {
    let crc = -1;
    for (const b of bytes) {
        crc ^= b;
        for (let i = 0; i < 8; i++) { crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    }
    return (crc ^ -1) >>> 0;
}

function chunk (type, data) {
    const content = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(content));
    return Buffer.concat([len, content, crc]);
}

/** 8bit RGBA、无 interlace、filter 0 的最小 PNG（自制，不含第三方资产）。 */
function encodePng (size, pixel) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // color type RGBA
    const rows = [];
    for (let y = 0; y < size; y++) {
        rows.push(Buffer.from([0]));
        for (let x = 0; x < size; x++) { rows.push(Buffer.from(pixel(x, y))); }
    }
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

function inRegion (x, y, r) {
    return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

// ---------------------------------------------------------------- 骨架数据
function tf (x, y, rotation = 0, scaleX = 1, scaleY = 1) {
    return { x, y, skew: rotation, rotation, scaleX, scaleY };
}

function translateFrame (duration, x, y) {
    return { duration, x, y, tweenEasing: 0 };
}

function rotateFrame (duration, rotation) {
    // 帧数据的旋转角度键是 `skew`：`out/dragonBones.js:12987`
    // `_frameFloatArray[...] = _getNumber(rawData, DataParser.SKEW, 0.0) * DEG_RAD`。
    // 误写成 `rotation` 不会报错——解析器按默认值 0 收，表现为「时间线存在但恒为 0」，
    // 只有把 `bone.global.skew` 逐帧采出来才看得见（r8 实测踩过）。
    return { duration, skew: rotation, tweenEasing: 0 };
}

const SKELETON = {
    version: '5.5',
    frameRate: FRAME_RATE,
    name: NAME,
    armature: [{
        name: NAME.toLowerCase(),
        type: 'Armature',
        frameRate: FRAME_RATE,
        defaultActions: {},
        bone: [
            { name: 'root', transform: tf(0, 0) },
            { name: 'body', parent: 'root', length: 24, transform: tf(0, 0) },
            { name: 'wing-left', parent: 'body', length: 20, transform: tf(-6, 6, 20) },
            { name: 'wing-right', parent: 'body', length: 20, transform: tf(-6, -6, -20) },
            { name: 'tail', parent: 'body', length: 28, transform: tf(24, 0) },
        ],
        slot: [
            { name: 'body', parent: 'body', z: 0 },
            { name: 'wing-left', parent: 'wing-left', z: 1 },
            { name: 'wing-right', parent: 'wing-right', z: 2 },
            { name: 'tail', parent: 'tail', z: 3 },
        ],
        skin: [{
            name: 'default',
            slot: [
                { name: 'body', display: [{ name: 'plate', path: '', type: 'Image' }] },
                { name: 'wing-left', display: [{ name: 'wing', path: '', type: 'Image' }] },
                { name: 'wing-right', display: [{ name: 'wing', path: '', type: 'Image' }] },
                { name: 'tail', display: [
                    { name: 'plate', path: '', type: 'Image' },
                    { name: 'tip', path: '', type: 'Image' },
                ] },
            ],
        }],
        animation: [
            {
                name: 'flap',
                duration: 24,
                playTimes: 0,
                slot: [{
                    name: 'tail',
                    displayFrame: [
                        { duration: 0, value: 0 },
                        { duration: 12, value: 1 },
                        { duration: 12, value: 0 },
                    ],
                }],
                bone: [
                    {
                        name: 'root',
                        translateFrame: [
                            translateFrame(0, 0, 0),
                            translateFrame(6, 0, 10),
                            translateFrame(6, 0, 0),
                            translateFrame(6, 0, -10),
                            translateFrame(6, 0, 0),
                        ],
                    },
                    {
                        name: 'wing-left',
                        rotateFrame: [
                            rotateFrame(0, 20),
                            rotateFrame(12, -25),
                            rotateFrame(12, 20),
                        ],
                    },
                    {
                        name: 'wing-right',
                        rotateFrame: [
                            rotateFrame(0, -20),
                            rotateFrame(12, 25),
                            rotateFrame(12, -20),
                        ],
                    },
                ],
            },
            {
                name: 'idle',
                duration: 12,
                playTimes: -1,
                slot: [{
                    name: 'tail',
                    displayFrame: [{ duration: 0, value: 0 }],
                }],
                bone: [{
                    name: 'body',
                    rotateFrame: [
                        rotateFrame(0, 0),
                        rotateFrame(6, 4),
                        rotateFrame(6, 0),
                    ],
                }],
            },
        ],
    }],
};

const ATLAS = {
    name: NAME,
    imagePath: `${NAME}_atlas.png`,
    width: ATLAS_SIZE,
    height: ATLAS_SIZE,
    scale: 1,
    SubTexture: REGIONS.map((r) => ({
        name: r.name,
        x: r.x,
        y: r.y,
        width: r.w,
        height: r.h,
        frameX: 0,
        frameY: 0,
        frameWidth: r.w,
        frameHeight: r.h,
        rotated: false,
    })),
};

// ---------------------------------------------------------------- 落盘
fs.mkdirSync(OUT_DIR, { recursive: true });
const png = encodePng(ATLAS_SIZE, (x, y) => {
    for (const r of REGIONS) {
        if (inRegion(x, y, r)) { return [...r.rgb, 255]; }
    }
    return [...BACKGROUND, 255];
});
const files = [
    [`${NAME}.json`, JSON.stringify(SKELETON, null, 2)],
    [`${NAME}_atlas.json`, JSON.stringify(ATLAS, null, 2)],
];
fs.writeFileSync(path.join(OUT_DIR, `${NAME}_atlas.png`), png);
for (const [f, text] of files) { fs.writeFileSync(path.join(OUT_DIR, f), text); }

const boneNames = SKELETON.armature[0].bone.map((b) => b.name);
const slotNames = SKELETON.armature[0].slot.map((s) => s.name);
const animNames = SKELETON.armature[0].animation.map((a) => a.name);
console.log(JSON.stringify({
    outDir: OUT_DIR.replace(/\\/g, '/'),
    pngBytes: png.length,
    bones: boneNames.length,
    slots: slotNames.length,
    regions: REGIONS.map((r) => r.name),
    animations: animNames,
    armatureName: SKELETON.armature[0].name,
    skeletonFile: `${NAME}.json`,
    atlasFile: `${NAME}_atlas.json`,
    pngFile: `${NAME}_atlas.png`,
}, null, 2));
