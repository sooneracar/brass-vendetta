(() => {
  const SFX_NAMES = [
    'ui_click', 'spin', 'stop', 'scatter_land', 'win',
    'vs_expand', 'vs_clash', 'bonus_trigger', 'big_win',
    'anticipation', 'countup_loop', 'countup_end', 'buy_bonus'
  ];

  const MUSIC_FILES = {
    base: 'music_base',
    bonus: 'music_bonus'
  };

  class AudioManager {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.musicBus = null;
      this.sfxBus = null;
      this.buffers = new Map();
      this.muted = false;
      this.unlocked = false;

      this.currentTrack = null;
      this.activeMusicNodes = [];
      this.loopTimer = null;
      this.crossfadeSec = 1.5;
      this.musicBaseVolume = 0.42;
      this.duckCount = 0;
    }

    ensureContext() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.musicBus = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();

        this.masterGain.gain.value = this.muted ? 0 : 1;
        this.musicBus.gain.value = this.musicBaseVolume;
        this.sfxBus.gain.value = 0.92;

        this.musicBus.connect(this.masterGain);
        this.sfxBus.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      this.unlocked = true;
    }

    async preload(onProgress) {
      this.ensureContext();
      const allKeys = [...SFX_NAMES, ...Object.values(MUSIC_FILES)];
      let done = 0;

      await Promise.all(allKeys.map(async (key) => {
        try {
          const res = await fetch(`assets/audio/${key}.mp3`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const arr = await res.arrayBuffer();
          const buf = await this.ctx.decodeAudioData(arr);
          this.buffers.set(key, buf);
        } catch (err) {
          console.warn(`[Audio] Yüklenemedi: assets/audio/${key}.mp3`, err.message);
        } finally {
          done++;
          if (onProgress) onProgress(done / allKeys.length);
        }
      }));
    }

    setMuted(muted) {
      this.muted = muted;
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.03);
      }
    }

    toggleMute() {
      this.setMuted(!this.muted);
      return this.muted;
    }

    duckMusic(active) {
      if (!this.musicBus || !this.ctx) return;
      this.duckCount = Math.max(0, this.duckCount + (active ? 1 : -1));
      const target = this.duckCount > 0 ? this.musicBaseVolume * 0.36 : this.musicBaseVolume;
      this.musicBus.gain.setTargetAtTime(target, this.ctx.currentTime, 0.14);
    }

    playMusic(trackName) {
      if (this.currentTrack === trackName) return;
      this.ensureContext();
      const key = MUSIC_FILES[trackName];
      const buffer = this.buffers.get(key);
      if (!buffer) return;

      this.currentTrack = trackName;
      clearTimeout(this.loopTimer);
      this._fadeOutAllMusic(this.crossfadeSec);
      this._spawnMusicLoop(trackName, buffer, this.crossfadeSec);
    }

    _fadeOutAllMusic(fadeSec) {
      const now = this.ctx.currentTime;
      const old = this.activeMusicNodes;
      this.activeMusicNodes = [];
      old.forEach(({ src, gain }) => {
        try {
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(gain.gain.value, now);
          gain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
          src.stop(now + fadeSec + 0.08);
        } catch (_) {}
      });
    }

    _spawnMusicLoop(trackName, buffer, fadeInSec) {
      if (this.currentTrack !== trackName || !this.ctx) return;
      const now = this.ctx.currentTime;
      const cf = Math.min(this.crossfadeSec, Math.max(0.25, buffer.duration * 0.25));
      const src = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();

      src.buffer = buffer;
      src.connect(gain);
      gain.connect(this.musicBus);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(1.0, now + fadeInSec);

      const fadeOutStart = Math.max(now + fadeInSec + 0.1, now + buffer.duration - cf);
      gain.gain.setValueAtTime(1.0, fadeOutStart);
      gain.gain.linearRampToValueAtTime(0.0001, now + buffer.duration);

      src.start(now);
      src.stop(now + buffer.duration + 0.05);

      const node = { src, gain };
      this.activeMusicNodes.push(node);
      src.onended = () => {
        this.activeMusicNodes = this.activeMusicNodes.filter(n => n !== node);
      };

      const nextMs = Math.max(400, (buffer.duration - cf) * 1000);
      clearTimeout(this.loopTimer);
      this.loopTimer = setTimeout(() => {
        if (this.currentTrack === trackName) {
          this._spawnMusicLoop(trackName, buffer, cf);
        }
      }, nextMs);
    }

    playSfx(name, { volume = 1.0, rate = 1.0, loop = false } = {}) {
      if (!this.unlocked) return { stop: () => {} };
      const buffer = this.buffers.get(name);
      if (!buffer || !this.ctx) return { stop: () => {} };

      const now = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      src.loop = loop;
      gain.gain.setValueAtTime(volume, now);

      src.connect(gain);
      gain.connect(this.sfxBus);
      src.start(now);

      return {
        stop: (fadeMs = 80) => {
          try {
            const t = this.ctx.currentTime;
            const sec = Math.max(0.02, fadeMs / 1000);
            gain.gain.cancelScheduledValues(t);
            gain.gain.setValueAtTime(gain.gain.value, t);
            gain.gain.linearRampToValueAtTime(0.0001, t + sec);
            src.stop(t + sec + 0.02);
          } catch (_) {}
        }
      };
    }
  }

  window.BV_AUDIO = new AudioManager();
})();
