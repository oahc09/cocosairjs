/**
 * Cocos Air — 音频通道服务（W11，Code First 与 Web 可靠性任务清单）。
 *
 * 先用现有 AudioSource 的 loop/currentTime/pause/playOneShot 做业务抽象（任务书首选路径）：
 * - BGM 按 ID 一份可续播状态（每 ID 一个持久 AudioSource 节点；切换即暂停他台）；
 * - 音效池并发上限（默认 5）：每次触发创建独立 AudioSource，以 ENDED 回收并发位；
 * - 音乐/音效开关独立；
 * - 判据纪律：不以 playing=true 单独证明时钟推进——以 currentTime 实测推进为准（probe 断言）。
 *
 * 浏览器后端由 PAL 选择（Web Audio vs DOM `<audio>`）；播放头验证见专用浏览器探针与台账。
 * 手势解锁：引擎/浏览器 autoplay 策略域——部署侧以 --autoplay-policy 或用户手势解锁，
 * 本服务遇到未解锁播放会在 currentTime 上如实表现为不推进（可被 probe/业务观测）。
 *
 * 本文件为 Air 原创。
 */

import { Node } from '../cocos/scene-graph/node';
import { AudioSource } from '../cocos/audio/audio-source';
import { AudioClip } from '../cocos/audio/audio-clip';
import { assetManager } from '../cocos/asset/asset-manager';
import { Scene } from '../cocos/scene-graph/scene';

/** @en BGM channel state. @zh BGM 通道状态（currentTime 为实测时钟，非 playing 标志）。 */
export interface BgmState {
    id: string;
    playing: boolean;
    /** 实测播放头（秒）；未播放/无 clip 为 0。 */
    currentTime: number;
    loop: boolean;
    /** 通道音量，范围 [0, 1]。 */
    volume: number;
}

/** @en Options for [[AudioService]]. @zh AudioService 选项。 */
export interface AudioServiceOptions {
    /** 音效并发上限（默认 5）。 */
    maxSfxVoices?: number;
}

interface SfxVoice { source: AudioSource; timeout: ReturnType<typeof setTimeout>; }

/**
 * @en Business-level audio channels over native AudioSource.
 * @zh 原生 AudioSource 之上的业务音频通道服务。
 */
export class AudioService {
    private readonly _scene: Scene;
    private readonly _sources = new Map<string, AudioSource>();
    private readonly _clips = new Map<string, AudioClip>();
    private readonly _sfxVoices = new Set<SfxVoice>();
    private readonly _maxSfx: number;
    private _musicEnabled = true;
    private _sfxEnabled = true;
    private _bgmId: string | null = null;
    private _bgmVolume = 1;
    /** 超限被丢弃的音效次数（观测面）。 */
    sfxDropped = 0;

    constructor (scene: Scene, options: AudioServiceOptions = {}) {
        this._scene = scene;
        const max = options.maxSfxVoices ?? 5;
        if (!Number.isInteger(max) || max < 1) { throw new Error('[AudioService] maxSfxVoices must be a positive integer'); }
        this._maxSfx = max;
    }

    /** 注册音频资产（按 ID 寻址；重复注册同 ID 覆盖引用）。 */
    async load (id: string, url: string): Promise<AudioClip> {
        const existing = this._clips.get(id);
        if (existing) { return existing; }
        const clip = await new Promise<AudioClip>((resolve, reject) => {
            assetManager.loadRemote(url, (err, asset) => {
                if (err || !asset) { reject(new Error(`[AudioService] load failed: ${url}`)); return; }
                resolve(asset as AudioClip);
            });
        });
        this._clips.set(id, clip);
        return clip;
    }

    private _sourceFor (id: string): AudioSource {
        let src = this._sources.get(id);
        if (!src) {
            const node = new Node(`AudioService/BGM/${id}`);
            node.active = false;
            this._scene.addChild(node);
            src = node.addComponent(AudioSource);
            src.playOnAwake = false;
            src.volume = this._bgmVolume;
            src.clip = this._clips.get(id) ?? null;
            node.active = true;
            this._sources.set(id, src);
        }
        return src;
    }

    /** 当前 BGM 台（无则 null）。 */
    get bgmId (): string | null { return this._bgmId; }
    get musicEnabled (): boolean { return this._musicEnabled; }
    get sfxEnabled (): boolean { return this._sfxEnabled; }
    /** 已发起、尚未收到结束事件或释放的音效实例数。 */
    get sfxActive (): number { return this._sfxVoices.size; }

    /**
     * @en Play (or resume) the BGM channel for an id; other channels pause. Resuming continues
     * from the preserved currentTime（续播合同）.
     * @zh 播放/续播指定 ID 的 BGM；他台暂停。续播从保留的 currentTime 继续。
     */
    playBgm (id: string, loop = true): void {
        if (!this._musicEnabled) { return; }
        if (!this._clips.has(id)) { throw new Error(`[AudioService] BGM '${id}' is not loaded`); }
        for (const [otherId, src] of this._sources) {
            if (otherId !== id && src.playing) { src.pause(); }
        }
        const src = this._sourceFor(id);
        src.loop = loop;
        src.play();
        this._bgmId = id;
    }

    pauseBgm (): void {
        const src = this._bgmId ? this._sources.get(this._bgmId) : null;
        if (src) { src.pause(); }
    }

    /** 停止当前 BGM 并将播放头归零；保留 ID，resumeBgm 从零开始。节点名不是公开契约。 */
    stopBgm (): void {
        const src = this._bgmId ? this._sources.get(this._bgmId) : null;
        if (src) { src.stop(); src.currentTime = 0; }
    }

    /** 设置所有现有及后续 BGM 通道的音量；不改变音效音量、开关或播放头。 */
    setBgmVolume (volume: number): void {
        if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
            throw Object.assign(new RangeError('[AudioService] BGM volume must be finite and in [0, 1]'), {
                code: 'AIR_E_AUDIO_VOLUME',
            });
        }
        this._bgmVolume = volume;
        for (const src of this._sources.values()) { src.volume = volume; }
    }

    get bgmVolume (): number { return this._bgmVolume; }

    /** 恢复当前 BGM 台（从暂停点续播）。 */
    resumeBgm (): void {
        if (!this._musicEnabled || !this._bgmId) { return; }
        this._sources.get(this._bgmId)?.play();
    }

    /**
     * @en Fire a single-play SFX. Concurrent voices are capped at maxSfxVoices; excess fires are
     * dropped and counted（不静默排队）.
     * @zh 触发一次性音效。在途实例上限 maxSfxVoices，超限丢弃并计数。
     */
    playSfx (id: string, volume = 1): void {
        if (!this._sfxEnabled) { return; }
        const clip = this._clips.get(id);
        if (!clip) { return; }
        if (this._sfxVoices.size >= this._maxSfx) { this.sfxDropped += 1; return; }
        const node = new Node(`AudioService/SFX/${id}`);
        node.active = false;
        this._scene.addChild(node);
        const source = node.addComponent(AudioSource);
        source.playOnAwake = false;
        source.clip = clip;
        source.loop = false;
        source.volume = volume;
        const voice = { source, timeout: null as unknown as ReturnType<typeof setTimeout> };
        const release = (): void => {
            if (!this._sfxVoices.delete(voice)) { return; }
            clearTimeout(voice.timeout);
            source.stop();
            node.destroy();
        };
        node.once(AudioSource.EventType.ENDED, release);
        this._sfxVoices.add(voice);
        // Browser autoplay rejection may not emit ENDED. A bounded fallback frees
        // that voice; normal playback uses the native completion event above.
        voice.timeout = setTimeout(release, Math.max(1000, clip.duration * 1000 + 5000));
        node.active = true;
        try { source.play(); } catch (error) { release(); throw error; }
    }

    /** 音乐开关（独立于音效开关；关闭时暂停当前 BGM）。 */
    setMusicEnabled (on: boolean): void {
        this._musicEnabled = on;
        if (!on) { this.pauseBgm(); }
    }

    /** 音效开关（独立于音乐开关）。 */
    setSfxEnabled (on: boolean): void {
        this._sfxEnabled = on;
    }

    /**
     * @en Observable BGM state — currentTime is the measured clock（判据纪律：不单独信 playing）。
     * @zh 可观测 BGM 状态——currentTime 为实测时钟。
     */
    bgmState (): BgmState | null {
        if (!this._bgmId) { return null; }
        const src = this._sources.get(this._bgmId);
        if (!src) { return null; }
        return { id: this._bgmId, playing: src.playing, currentTime: src.currentTime, loop: src.loop, volume: src.volume };
    }

    /** @en Stop everything and destroy source nodes（页面销毁路径）。 @zh 停止并销毁全部源节点。 */
    dispose (): void {
        for (const src of this._sources.values()) {
            src.stop();
            src.node.destroy();
        }
        this._sources.clear();
        this._clips.clear();
        for (const voice of this._sfxVoices) {
            clearTimeout(voice.timeout);
            voice.source.stop();
            voice.source.node.destroy();
        }
        this._sfxVoices.clear();
        this._bgmId = null;
    }
}
