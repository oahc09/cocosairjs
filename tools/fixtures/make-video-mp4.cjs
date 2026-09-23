/**
 * 生成 examples/video-basic/assets/clip.mp4（LV12-04 唯一资产）。
 *
 * 为什么用 ffmpeg 而不是像 `make-tone-wav.cjs` 那样手写容器：H.264 比特流不可手写。
 * 因此本脚本是**再生成器 + 溯源记录**，不是构建依赖 —— 资产已入库（25,279 B），
 * 门禁（`verify:file-map` / 矩阵 / jest）只读入库字节，不跑 ffmpeg。
 *
 * 编码参数的选择全部由三引擎真实解码探测决定（不是 canPlayType）：
 *   probe: E:/AIProMax/cocosair-scratch/v12-diag/video-decode-probe.cjs
 *   json : E:/AIProMax/cocosair-scratch/v12-diag/video-decode-probe.json
 * - baseline + yuv420p + 无音频 + faststart ⇒ chromium / firefox / webkit 三引擎都能
 *   `loadedmetadata` 且真的出帧（`drawImage` 非黑 + 帧间变化）。
 * - 反例（同 lavfi 源，仅改 pix_fmt/容器）：`-pix_fmt yuv444p` 在 firefox 直接
 *   `MEDIA_ERR_SRC_NOT_SUPPORTED(3)`、在 webkit 把 120 行高报成 112 且永不进播放态；
 *   `vp8 webm` 在 webkit `canPlayType` 返回 "probably"、`meta=false`、`duration=NaN`，
 *   但 `play()` 仍 resolve 且 `currentTime` 跳到 3 —— 假播放，帧恒黑。
 * - 尺寸 160x120 是刻意的：`keepAspectRatio` 会把 UITransform 覆盖成 videoWidth/Height
 *   （video-player-impl.ts:237-243 `syncUITransform`），所以资产尺寸本身就是一个硬断言值。
 * - 3 s @15 fps 让「自然播完 → COMPLETED → loop 回绕」在一个矩阵 waitMs 窗口内跑得完。
 *
 * 用法：node tools/fixtures/make-video-mp4.cjs [输出路径]
 *   默认 examples/video-basic/assets/clip.mp4；打印 bytes + sha256 前 16 位。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const out = process.argv[2] || path.join(process.cwd(), 'examples', 'video-basic', 'assets', 'clip.mp4');

const FFMPEG_ARGS = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=160x120:rate=15:duration=3',
    '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0', '-pix_fmt', 'yuv420p',
    '-crf', '30', '-movflags', '+faststart', '-an',
];

fs.mkdirSync(path.dirname(out), { recursive: true });
try {
    execFileSync('ffmpeg', [...FFMPEG_ARGS, out], { stdio: ['ignore', 'ignore', 'pipe'] });
} catch (e) {
    console.error('ffmpeg 不可用或编码失败：本脚本只是再生成器，仓库里的 assets/clip.mp4 才是权威字节。');
    console.error(String(e.stderr || e.message).slice(0, 400));
    process.exit(1);
}

const buf = fs.readFileSync(out);
console.log('ffmpeg ' + FFMPEG_ARGS.join(' ') + ' ' + out);
console.log('wrote ' + out + '  bytes=' + buf.length + '  sha256_16=' + crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16));
