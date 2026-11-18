// WebAudio による効果音・BGM（すべてその場で合成。素材ファイル不要）
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('katsuo_muted') === '1'; } catch (e) { /* noop */ }
    this.last = {};
    this.musicOn = false;
    this.intensity = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.55; this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.22; this.music.connect(this.master);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('katsuo_muted', m ? '1' : '0'); } catch (e) { /* noop */ }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  _throttle(name, ms) {
    const now = performance.now();
    if (this.last[name] && now - this.last[name] < ms) return true;
    this.last[name] = now;
    return false;
  }

  _noise(t, dur, freq, q, gain, type = 'bandpass', dest = this.sfx) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
    return f;
  }

  _tone(t, dur, f0, f1, type, gain, dest = this.sfx, attack = 0.004) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }

  play(name) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'swing':
        if (this._throttle(name, 60)) return;
        {
          const f = this._noise(t, 0.22, 600, 1.2, 0.25);
          f.frequency.exponentialRampToValueAtTime(2400, t + 0.18);
        }
        break;
      case 'slap': // 鰹で叩く「バシッ」
        if (this._throttle(name, 45)) return;
        this._noise(t, 0.09, 1800, 0.9, 0.9);
        this._noise(t, 0.05, 4200, 2, 0.4, 'highpass');
        this._tone(t, 0.12, 170, 70, 'sine', 0.7);
        break;
      case 'hit':
        if (this._throttle(name, 35)) return;
        this._noise(t, 0.05, 2500, 1.5, 0.25);
        break;
      case 'kill':
        if (this._throttle(name, 40)) return;
        this._tone(t, 0.08, 520 + Math.random() * 200, 180, 'triangle', 0.18);
        break;
      case 'gem':
        if (this._throttle(name, 40)) return;
        this._tone(t, 0.07, 1250 + Math.random() * 300, 1800, 'sine', 0.12);
        break;
      case 'throw':
        if (this._throttle(name, 80)) return;
        { const f = this._noise(t, 0.3, 400, 2, 0.2); f.frequency.exponentialRampToValueAtTime(1400, t + 0.3); }
        break;
      case 'flake':
        if (this._throttle(name, 90)) return;
        this._noise(t, 0.06, 5000, 1, 0.12, 'highpass');
        break;
      case 'fire':
        if (this._throttle(name, 400)) return;
        this._noise(t, 0.35, 900, 0.5, 0.08, 'lowpass');
        break;
      case 'ponzu':
        this._tone(t, 0.2, 300, 120, 'sine', 0.25);
        this._noise(t, 0.2, 800, 1, 0.12);
        break;
      case 'hurt':
        if (this._throttle(name, 120)) return;
        this._tone(t, 0.25, 220, 90, 'sawtooth', 0.25);
        break;
      case 'levelup':
        [523, 659, 784, 1047].forEach((f, i) => this._tone(t + i * 0.07, 0.25, f, f, 'square', 0.12));
        break;
      case 'chest':
        [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this._tone(t + i * 0.08, 0.4, f, f, 'triangle', 0.2));
        break;
      case 'heal':
        [660, 880, 1100].forEach((f, i) => this._tone(t + i * 0.06, 0.2, f, f, 'sine', 0.18));
        break;
      case 'boss':
        for (let i = 0; i < 4; i++) {
          this._tone(t + i * 0.5, 0.45, 440, 660, 'sawtooth', 0.14);
        }
        break;
      case 'bossdie':
        this._tone(t, 1.2, 200, 30, 'sawtooth', 0.4);
        this._noise(t, 1.0, 400, 0.6, 0.6, 'lowpass');
        break;
      case 'shoot':
        if (this._throttle(name, 90)) return;
        this._tone(t, 0.1, 700, 300, 'square', 0.06);
        break;
      case 'dash':
        { const f = this._noise(t, 0.5, 200, 1, 0.4, 'lowpass'); f.frequency.exponentialRampToValueAtTime(1200, t + 0.4); }
        break;
      case 'gameover':
        [392, 349, 311, 262].forEach((f, i) => this._tone(t + i * 0.28, 0.5, f, f * 0.98, 'triangle', 0.25));
        break;
      case 'click':
        this._tone(t, 0.05, 900, 900, 'square', 0.06);
        break;
    }
  }

  // ---- BGM：陽音階（ヨナ抜き）の祭囃子風ループ
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.tempo = 138;
    if (!this.melody) this._compose();
    this.timer = setInterval(() => this._schedule(), 25);
  }
  stopMusic() {
    this.musicOn = false;
    clearInterval(this.timer);
  }
  _compose() {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    // D E G A B (ヨナ抜き長音階)
    const scale = [293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.25, 783.99, 880];
    this.melody = [];
    let idx = 4;
    for (let bar = 0; bar < 8; bar++) {
      for (let s = 0; s < 16; s++) {
        let note = null;
        const strong = s % 4 === 0;
        if (strong || rnd() < 0.45) {
          idx += Math.floor(rnd() * 5) - 2;
          idx = Math.max(0, Math.min(scale.length - 1, idx));
          if (bar % 4 === 3 && s >= 12) idx = s === 12 ? 5 : idx;
          note = scale[idx];
        }
        this.melody.push(note);
      }
    }
    this.bass = [73.42, 73.42, 98.0, 110.0, 73.42, 61.74, 98.0, 110.0];
  }
  _schedule() {
    if (!this.musicOn) return;
    const ctx = this.ctx;
    const spb = 60 / this.tempo / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this._playStep(this.step, this.nextTime);
      this.nextTime += spb;
      this.step = (this.step + 1) % 128;
    }
  }
  _playStep(step, t) {
    if (this.muted) return;
    const s16 = step % 16, bar = Math.floor(step / 16);
    const mus = this.music;
    // 太鼓
    if (s16 === 0 || s16 === 6 || s16 === 8 || (s16 === 11 && bar % 2) || (this.intensity && s16 === 14)) {
      this._tone(t, 0.32, 120, 48, 'sine', 0.9, mus, 0.002);
      this._noise(t, 0.05, 300, 1, 0.3, 'lowpass', mus);
    }
    // 締太鼓
    if (s16 === 4 || s16 === 12 || (this.intensity && s16 % 2 === 1)) this._noise(t, 0.06, 2200, 3, 0.35, 'bandpass', mus);
    // 鉦
    if (s16 % 4 === 2) this._tone(t, 0.08, 2600, 2550, 'square', 0.05, mus, 0.001);
    // ベース
    if (s16 % 4 === 0 || s16 % 4 === 3) {
      const f = this.bass[bar % 8];
      this._tone(t, 0.18, f, f, 'triangle', 0.5, mus, 0.005);
    }
    // 笛（メロディ）
    const n = this.melody[step];
    if (n) {
      const o = this.ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(n * (this.intensity ? 1.0 : 1), t);
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 6;
      const lg = this.ctx.createGain(); lg.gain.value = n * 0.012;
      lfo.connect(lg); lg.connect(o.frequency);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.32, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g); g.connect(mus);
      o.start(t); o.stop(t + 0.22); lfo.start(t); lfo.stop(t + 0.22);
    }
  }
}
