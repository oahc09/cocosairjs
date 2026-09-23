/**
 * 生成 examples/audio-basic/assets/tone.wav（LV12-03 唯一资产）。
 * 手写 RIFF/PCM，无第三方编码依赖 ⇒ 许可干净、三浏览器 decodeAudioData 都能吃。
 *
 * 内容：mono / 16-bit PCM / **8000 Hz** / 1.600 s（12800 帧），
 *      前半 440 Hz @0.50、后半 660 Hz @0.25，每段首尾 88 样本线性包络（防爆音）。
 * 决定性：正弦相位从 0 起、包络对称 ⇒ PCM 峰值≈0.5（8 kHz 下 440 Hz 采不到精确极值，实测 0.494），
 *        两段幅度 2:1 设计（实测比值≈1.98）⇒ 波形条在图上肉眼可分。
 *
 * 为什么是 8000 Hz：Playwright 的 webkit-2361（Windows）**没有 Web Audio API**（`AudioContext`/
 * `webkitAudioContext`/`OfflineAudioContext` 全为 `undefined`），引擎只能退回 `<audio>` DOM 播放器；
 * 而该 build 的 WAV 元数据解析对高采样率失真：同一支 1.600 s 音频，`<audio>.duration` 报
 * 22050→0.3705 / 44100→0.1853 / 48000 mono→0.1702 / 48000 stereo→0.0851，只有 **8000→1.6000** 正确
 * （chromium/firefox 六种封装全部 1.6000）。实测命令与 JSON：
 *   NODE_PATH=…/node_modules node E:/AIProMax/cocosair-scratch/v12-logs/wav-dom-durations.cjs
 *   ⇒ E:/AIProMax/cocosair-scratch/v12-diag/wav-dom-durations.json
 * 换 8000 Hz 后三引擎 `duration` 对齐，引擎侧再统一重采样到 context 采样率。
 */
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 8000;
const SECONDS = 1.6;
const FRAMES = Math.round(SAMPLE_RATE * SECONDS);
const ENV = 88;
const TONES = [440, 660];
const AMPS = [0.5, 0.25];

const samples = new Int16Array(FRAMES);
const half = FRAMES / 2;
for (let i = 0; i < FRAMES; i++) {
    const seg = i < half ? 0 : 1;
    const local = i - seg * half;
    const env = Math.min(1, Math.min(local, half - 1 - local) / ENV);
    const v = AMPS[seg] * env * Math.sin(2 * Math.PI * TONES[seg] * (local / SAMPLE_RATE));
    samples[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
}

const dataBytes = Buffer.from(samples.buffer);
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + dataBytes.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);           // PCM
header.writeUInt16LE(1, 22);           // mono
header.writeUInt32LE(SAMPLE_RATE, 24);
header.writeUInt32LE(SAMPLE_RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(dataBytes.length, 40);

const out = process.argv[2] || path.join(process.cwd(), 'tone.wav');
fs.writeFileSync(out, Buffer.concat([header, dataBytes]));

let peak = 0;
let sumSq = 0;
for (const s of samples) {
    const n = s / 32767;
    peak = Math.max(peak, Math.abs(n));
    sumSq += n * n;
}
const rms = (seg) => {
    let acc = 0;
    const from = seg * half;
    const to = from + half;
    for (let i = from; i < to; i++) { const n = samples[i] / 32767; acc += n * n; }
    return Math.sqrt(acc / (to - from));
};
console.log(JSON.stringify({
    out,
    bytes: 44 + dataBytes.length,
    frames: FRAMES,
    sampleRate: SAMPLE_RATE,
    seconds: FRAMES / SAMPLE_RATE,
    peak: Number(peak.toFixed(4)),
    rmsSeg0: Number(rms(0).toFixed(4)),
    rmsSeg1: Number(rms(1).toFixed(4)),
    firstSamples: [samples[0], samples[1], samples[2]].join(','),
}, null, 2));
