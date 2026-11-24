import { getAssetBlobRecord } from '@/src/core/storage/modRepository';
import { ModAsset } from '@/src/types/mod';

export type BuiltinSoundCue =
  | 'woa:sfx_blade_hum'
  | 'woa:sfx_swing'
  | 'woa:sfx_impact'
  | 'woa:sfx_pickup'
  | 'woa:sfx_door'
  | 'woa:sfx_dialogue'
  | 'woa:sfx_error';

export class SandboxAudioEngine {
  private ctx: AudioContext | null = null;
  private activeHtmlAudio: HTMLAudioElement | null = null;
  private activeObjectUrl: string | null = null;
  private muted = false;
  private volume = 0.65;

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.stopAll();
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.activeHtmlAudio) {
      this.activeHtmlAudio.volume = this.volume;
    }
  }

  public stopAll(): void {
    if (this.activeHtmlAudio) {
      this.activeHtmlAudio.pause();
      this.activeHtmlAudio.currentTime = 0;
      this.activeHtmlAudio = null;
    }
    if (this.activeObjectUrl) {
      URL.revokeObjectURL(this.activeObjectUrl);
      this.activeObjectUrl = null;
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playProceduralCue(cue: BuiltinSoundCue | string): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const v = Math.max(0.05, this.volume * 0.35);

    if (cue === 'woa:sfx_swing' || cue === 'woa:sfx_blade_hum') {
      osc.type = cue === 'woa:sfx_blade_hum' ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.18);
      gain.gain.setValueAtTime(v, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.23);
    } else if (cue === 'woa:sfx_impact') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(170, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + 0.14);
      gain.gain.setValueAtTime(v * 1.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.start(now);
      osc.stop(now + 0.17);
    } else if (cue === 'woa:sfx_pickup') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.06);
      osc.frequency.setValueAtTime(783.99, now + 0.12);
      gain.gain.setValueAtTime(v, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.26);
    } else if (cue === 'woa:sfx_door') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(125, now);
      osc.frequency.linearRampToValueAtTime(195, now + 0.2);
      gain.gain.setValueAtTime(v, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      osc.start(now);
      osc.stop(now + 0.27);
    } else if (cue === 'woa:sfx_dialogue') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(554.37, now + 0.05);
      gain.gain.setValueAtTime(v * 0.7, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.15);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.linearRampToValueAtTime(110, now + 0.18);
      gain.gain.setValueAtTime(v * 0.85, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.22);
    }
  }

  public async playSoundReference(
    soundRef: string,
    assets: ModAsset[]
  ): Promise<{ source: string; kind: 'builtin' | 'asset' }> {
    const trimmed = soundRef.trim();
    if (!trimmed) {
      throw new Error('Audio reference is empty.');
    }

    if (trimmed.startsWith('woa:')) {
      this.playProceduralCue(trimmed);
      return { source: trimmed, kind: 'builtin' };
    }

    const matchingAsset = assets.find(
      (a) =>
        a.type === 'audio' &&
        (a.path === trimmed ||
          a.path.replace(/^assets\/audio\//, 'assets/sounds/') === trimmed ||
          a.id === trimmed)
    );

    if (!matchingAsset) {
      throw new Error(
        `Missing audio asset "${trimmed}": file was not found in the mod project.`
      );
    }

    if (!matchingAsset.blobKey) {
      throw new Error(
        `Audio asset "${matchingAsset.path}" has no playable local binary stored.`
      );
    }

    const rec = await getAssetBlobRecord(matchingAsset.blobKey);
    if (!rec) {
      throw new Error(
        `Audio binary missing in offline storage for "${matchingAsset.path}".`
      );
    }

    if (this.muted) {
      return { source: matchingAsset.path, kind: 'asset' };
    }

    this.stopAll();
    const blob = new Blob([rec.data], { type: rec.mimeType || 'audio/wav' });
    const url = URL.createObjectURL(blob);
    this.activeObjectUrl = url;

    const audio = new Audio(url);
    audio.volume = this.volume;
    this.activeHtmlAudio = audio;

    audio.onended = () => {
      if (this.activeHtmlAudio === audio) {
        this.stopAll();
      }
    };

    try {
      await audio.play();
      return { source: matchingAsset.path, kind: 'asset' };
    } catch (err) {
      this.stopAll();
      throw new Error(
        `Audio playback failed for "${matchingAsset.path}": ${
          err instanceof Error ? err.message : 'Unable to decode audio stream.'
        }`
      );
    }
  }

  public dispose(): void {
    this.stopAll();
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
