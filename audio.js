(() => {
  const SFX_NAMES = [
    'ui_click', 'spin', 'stop', 'scatter_land', 'win',
    'vs_expand', 'vs_clash', 'bonus_trigger', 'big_win',
    'anticipation', 'countup_loop', 'countup_end', 'buy_bonus'
  ];

  // Aşama 4 Ses Miksajı: Mekanik spin/stop sertliği yumuşatıldı, müzik dengelendi
  const SFX_MIX = {
    ui_click: 0.55,
    spin: 0.36,
    stop: 0.34,
    scatter_land: 0.85,
    win: 0.78,
    vs_expand: 0.82,
    vs_clash: 0.88,
    bonus_trigger: 0.90,
    big_win: 0.92,
    anticipation: 0.65,
    countup_loop: 0.55,
    countup_end: 0.84,
    buy_bonus: 0.82
  };

  const MUSIC_PATHS = {
    base: 'assets/audio/music_base.mp3',
    bonus: 'assets/audio/music_bonus.mp3'
  };

  class AudioManager {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.sfxBus = null;
      this.buffers = new Map();
      this.muted = false;
      this.unlocked = false;
      this.paused = false;

      this.musicEls = {};
      this.currentTrack = null;
      this.musicBaseVolume = 0.48;
      this.duckCount = 0;
      this._fadeIntervals = new Map();
    }

    ensureContext() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();

        this.masterGain.gain.value = this.muted ? 0 : 1;
        this.sfxBus.gain.value = 0.88;

        this.sfxBus.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended' && !this.paused) {
        this.ctx.resume().catch(() => {});
      }

      Object.entries(MUSIC_PATHS).forEach(([name, src]) => {
        if (!this.musicEls[name]) {
          const el = new Audio(src);
          el.loop = true;
          el.preload = 'auto';
          el.volume = 0;
          el.muted = this.muted;
          this.musicEls[name] = el;
        }
      });

      this.unlocked = true;
    }

    // GLOBAL PAUSE GATE: Ekran alta indiğinde hem müzik hem TÜM SFX anında donar
    pauseAll() {
      this.paused = true;
      if (this.ctx && this.ctx.state === 'running') {
        this.ctx.suspend().catch(() => {});
      }
      Object.values(this.musicEls).forEach((el) => {
        try { el.pause(); } catch (_) {}
      });
    }

    resumeAll() {
      this.paused = false;
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      if (!this.muted && this.unlocked && this.currentTrack && this.musicEls[this.currentTrack]) {
        const el = this.musicEls[this.currentTrack];
        el.volume = this._targetMusicVol();
        el.play().catch(() => {});
      }
    }

    async preload(onProgress) {
      this.ensureContext();
      let done = 0;
      await Promise.all(SFX_NAMES.map(async (key) => {
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
          if (onProgress) onProgress(done / SFX_NAMES.length);
        }
      }));
    }

    _targetMusicVol() {
      if (this.muted) return 0;
      return this.duckCount > 0 ? this.musicBaseVolume * 0.34 : this.musicBaseVolume;
    }

    _fadeElement(name, targetVol, durationMs = 950, pauseAtZero = false) {
      const el = this.musicEls[name];
      if (!el) return;
      if (this._fadeIntervals.has(name)) clearInterval(this._fadeIntervals.get(name));
      const startVol = el.volume;
      const steps = Math.max(1, Math.round(durationMs / 35));
      let step = 0;
      const id = setInterval(() => {
        if (this.paused) return;
        step++;
        const p = Math.min(1, step / steps);
        el.volume = Math.max(0, Math.min(1, startVol + (targetVol - startVol) * p));
        if (p >= 1) {
          clearInterval(id);
          this._fadeIntervals.delete(name);
          if (pauseAtZero && targetVol <= 0.001) el.pause();
        }
      }, 35);
      this._fadeIntervals.set(name, id);
    }

    setMuted(muted) {
      this.muted = muted;
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.03);
      }
      Object.values(this.musicEls).forEach((el) => { el.muted = muted; });
      if (!muted && !this.paused && this.currentTrack && this.musicEls[this.currentTrack]) {
        const el = this.musicEls[this.currentTrack];
        el.volume = this._targetMusicVol();
        el.play().catch(() => {});
      }
    }

    toggleMute() {
      this.setMuted(!this.muted);
      return this.muted;
    }

    duckMusic(active) {
      this.duckCount = Math.max(0, this.duckCount + (active ? 1 : -1));
      if (this.currentTrack) {
        this._fadeElement(this.currentTrack, this._targetMusicVol(), 280, false);
      }
    }

    playMusic(trackName) {
      this.ensureContext();
      if (this.currentTrack === trackName) {
        const cur = this.musicEls[trackName];
        if (cur && cur.paused && !this.muted && !this.paused) cur.play().catch(() => {});
        return;
      }

      const prevTrack = this.currentTrack;
      this.currentTrack = trackName;

      if (prevTrack && this.musicEls[prevTrack]) {
        this._fadeElement(prevTrack, 0, 1100, true);
      }

      const nextEl = this.musicEls[trackName];
      if (!nextEl) return;
      nextEl.muted = this.muted;
      nextEl.volume = 0;
      if (nextEl.paused && !this.paused) {
        nextEl.currentTime = 0;
        nextEl.play().catch(() => {});
      }
      this._fadeElement(trackName, this._targetMusicVol(), 1100, false);
    }

    playSfx(name, { volume = 1.0, rate = 1.0, loop = false } = {}) {
      if (!this.unlocked || !this.ctx || this.paused) return { stop: () => {} };
      let buffer = this.buffers.get(name);
      if (!buffer && name === 'big_win') {
        buffer = this.buffers.get('bonus_trigger') || this.buffers.get('win');
      }
      if (!buffer) return { stop: () => {} };

      const mix = SFX_MIX[name] ?? 0.75;
      const now = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      src.loop = loop;
      gain.gain.setValueAtTime(Math.min(1, volume * mix), now);

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