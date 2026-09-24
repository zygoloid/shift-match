// Synthesized sound effects (Web Audio, no sound files). Each visual theme
// has its own instrument voice for the clear chimes.
(function (root) {
  'use strict';

  // Clear chimes climb a major pentatonic scale, one step per chain step.
  const PENTATONIC = [0, 2, 4, 7, 9];
  const BASE_HZ = 392; // G4

  function scaleHz(step) {
    const octave = Math.floor(step / PENTATONIC.length);
    const semis = PENTATONIC[step % PENTATONIC.length] + 12 * octave;
    return BASE_HZ * Math.pow(2, semis / 12);
  }

  // Each partial is [frequency ratio, relative level]. `decay` is seconds to
  // fade, `filter` an optional low-pass cutoff in Hz.
  const INSTRUMENTS = {
    classic: { wave: 'sine', partials: [[1, 1], [2, 0.3], [3, 0.12]], decay: 0.45 },
    candy: { wave: 'sine', partials: [[1, 1], [4, 0.35], [9.8, 0.1]], decay: 0.3 },
    neon: { wave: 'sawtooth', partials: [[1, 0.5], [1.006, 0.5]], decay: 0.35, filter: 2600 },
    paper: { wave: 'triangle', partials: [[1, 1], [2, 0.2]], decay: 0.16, filter: 2000 },
    glass: { wave: 'sine', partials: [[1, 1], [2.76, 0.45], [5.4, 0.22], [8.93, 0.1]], decay: 1.1 },
    pixel: { wave: 'square', partials: [[1, 0.6]], decay: 0.14, filter: 5000 },
  };

  class Sound {
    // `ctx` may be an OfflineAudioContext (for rendering previews). Without
    // one, a real AudioContext is made on first use, after a user gesture.
    constructor(ctx) {
      this.ctx = null;
      this.muted = false;
      this.instrument = INSTRUMENTS.classic;
      if (ctx) this.attach(ctx);
    }

    attach(ctx) {
      this.ctx = ctx;
      this.offline = typeof root.OfflineAudioContext !== 'undefined' && ctx instanceof root.OfflineAudioContext;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.ratio.value = 6;
      this.out = ctx.createGain();
      this.out.gain.value = 0.55;
      this.out.connect(compressor);
      compressor.connect(ctx.destination);
    }

    // Returns the audio context, or null if sound is off or unavailable.
    ready() {
      if (this.muted) return null;
      if (!this.ctx) {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return null;
        try {
          this.attach(new AC());
        } catch (e) {
          return null;
        }
      }
      if (this.ctx.state === 'suspended' && !this.offline) this.ctx.resume();
      return this.ctx;
    }

    setInstrument(name) {
      this.instrument = INSTRUMENTS[name] || INSTRUMENTS.classic;
    }

    // One pitched note in the current instrument.
    note(hz, when, level = 0.3, inst = this.instrument) {
      const ctx = this.ctx;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, when);
      env.gain.linearRampToValueAtTime(level, when + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0001, when + inst.decay);
      let dest = env;
      if (inst.filter) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = inst.filter;
        lp.connect(env);
        dest = lp;
      }
      env.connect(this.out);
      for (const [ratio, amp] of inst.partials) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = inst.wave;
        osc.frequency.value = hz * ratio;
        g.gain.value = amp;
        osc.connect(g);
        g.connect(dest);
        osc.start(when);
        osc.stop(when + inst.decay + 0.05);
      }
    }

    noise() {
      if (!this.noiseBuffer || this.noiseBuffer.sampleRate !== this.ctx.sampleRate) {
        const len = this.ctx.sampleRate * 2;
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this.noiseBuffer = buf;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      return src;
    }

    // A burst of filtered noise: the building block for claps and whooshes.
    hiss(when, dur, { hz = 1500, q = 1, level = 0.2, type = 'bandpass', sweepTo } = {}) {
      const ctx = this.ctx;
      const src = this.noise();
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.setValueAtTime(hz, when);
      if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, when + dur);
      filter.Q.value = q;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, when);
      env.gain.linearRampToValueAtTime(level, when + Math.min(0.01, dur / 3));
      env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      src.connect(filter);
      filter.connect(env);
      env.connect(this.out);
      src.start(when, Math.random() * 1.5);
      src.stop(when + dur + 0.02);
    }

    // A crowd clapping: many short, randomly timed noise claps.
    applause(when, dur, intensity = 1) {
      const claps = Math.round(dur * 26 * intensity);
      for (let i = 0; i < claps; i++) {
        const t = when + Math.random() * dur;
        // Swell in, then die away.
        const shape = Math.sin(Math.PI * Math.min(1, (t - when) / dur)) ** 0.6;
        this.hiss(t, 0.04 + Math.random() * 0.03, {
          hz: 900 + Math.random() * 1600,
          q: 1.2,
          level: 0.12 * shape * (0.6 + Math.random() * 0.4),
        });
      }
    }

    // A "whoo" from a crowd: noise through vowel-like formants that rise.
    cheer(when, dur = 1.2) {
      for (const [hz, level] of [[600, 0.1], [1100, 0.08], [2400, 0.04]]) {
        const ctx = this.ctx;
        const src = this.noise();
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 6;
        f.frequency.setValueAtTime(hz * 0.8, when);
        f.frequency.linearRampToValueAtTime(hz * 1.25, when + dur * 0.4);
        f.frequency.linearRampToValueAtTime(hz * 1.1, when + dur);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, when);
        env.gain.linearRampToValueAtTime(level * 2.5, when + dur * 0.25);
        env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        src.connect(f);
        f.connect(env);
        env.connect(this.out);
        src.start(when, Math.random());
        src.stop(when + dur + 0.05);
      }
    }

    // ---- Game sounds ----

    // A group cleared. `chain` is the chain step (1 = first clear of a move),
    // `size` the number of tiles.
    clear(chain, size) {
      if (!this.ready()) return;
      const t = this.ctx.currentTime + 0.01;
      const step = Math.min(chain - 1, 14);
      const notes = Math.min(2 + (size - 3), 4);
      for (let i = 0; i < notes; i++) this.note(scaleHz(step + i * 2), t + i * 0.045, 0.26);
      if (chain >= 3) {
        // Sparkles: quick high blips that get busier with the chain.
        const sparkles = Math.min(chain, 8);
        for (let i = 0; i < sparkles; i++) {
          this.note(scaleHz(step + 10 + ((i * 3) % 7)), t + 0.05 + i * 0.03, 0.07, INSTRUMENTS.candy);
        }
      }
      if (chain >= 4) this.hiss(t, 0.35, { hz: 800, sweepTo: 6000, q: 0.8, level: 0.05 + 0.01 * Math.min(chain, 10) });
    }

    // After a move whose chain reached `chain` steps: applause for long ones.
    celebrate(chain) {
      if (chain < 5 || !this.ready()) return;
      const t = this.ctx.currentTime + 0.02;
      this.applause(t, 0.8 + 0.12 * Math.min(chain, 12), Math.min(1 + (chain - 5) * 0.15, 2));
      if (chain >= 8) this.cheer(t + 0.05, 1.3);
    }

    win() {
      if (!this.ready()) return;
      const t = this.ctx.currentTime + 0.02;
      const brass = { wave: 'sawtooth', partials: [[1, 0.5], [1.004, 0.5]], decay: 0.5, filter: 2200 };
      const long = { ...brass, decay: 1.6 };
      // Da-da-da-daaa, then a held major chord.
      [0, 2, 4].forEach((s, i) => this.note(scaleHz(s), t + i * 0.13, 0.34, brass));
      for (const s of [5, 7, 9]) this.note(scaleHz(s), t + 0.42, 0.26, long);
      this.applause(t + 0.3, 2.6, 2);
      this.cheer(t + 0.35, 1.6);
    }

    lose() {
      if (!this.ready()) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.02;
      // Sad trombone: three falling notes, then a long wobbling one.
      const notes = [[311, 0.32], [294, 0.32], [277, 0.32], [262, 1.1]];
      let at = t;
      notes.forEach(([hz, dur], i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(hz, at);
        if (i === notes.length - 1) {
          const lfo = ctx.createOscillator();
          const depth = ctx.createGain();
          lfo.frequency.value = 5.5;
          depth.gain.value = 6;
          lfo.connect(depth);
          depth.connect(osc.frequency);
          lfo.start(at);
          lfo.stop(at + dur);
        }
        const wah = ctx.createBiquadFilter();
        wah.type = 'lowpass';
        wah.Q.value = 5;
        wah.frequency.setValueAtTime(400, at);
        wah.frequency.linearRampToValueAtTime(1300, at + 0.08);
        wah.frequency.linearRampToValueAtTime(600, at + dur);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, at);
        env.gain.linearRampToValueAtTime(0.15, at + 0.03);
        env.gain.setValueAtTime(0.15, at + dur - 0.08);
        env.gain.linearRampToValueAtTime(0, at + dur);
        osc.connect(wah);
        wah.connect(env);
        env.connect(this.out);
        osc.start(at);
        osc.stop(at + dur + 0.02);
        at += dur + 0.04;
      });
    }

    // A color died out: a falling shimmer.
    extinct() {
      if (!this.ready()) return;
      const t = this.ctx.currentTime + 0.01;
      for (let i = 0; i < 6; i++) this.note(scaleHz(16 - i * 2), t + i * 0.05, 0.08, INSTRUMENTS.glass);
      this.hiss(t, 0.5, { hz: 5000, sweepTo: 400, q: 0.7, level: 0.06 });
    }

    tap() {
      if (!this.ready()) return;
      const t = this.ctx.currentTime + 0.005;
      this.note(scaleHz(0) * 2, t, 0.08, { wave: 'triangle', partials: [[1, 1]], decay: 0.06 });
    }

    refuse() {
      if (!this.ready()) return;
      const t = this.ctx.currentTime + 0.005;
      this.note(110, t, 0.2, { wave: 'square', partials: [[1, 1]], decay: 0.12, filter: 500 });
    }
  }

  const api = { Sound, INSTRUMENTS, scaleHz };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ShiftSound = api;
})(typeof window !== 'undefined' ? window : globalThis);
