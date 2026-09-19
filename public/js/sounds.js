// Real sounds from lichess (github.com/lichess-org/lila, public/sound/standard),
// stored in assets/sounds/. Synthesized tones remain as a fallback for any
// file that fails to load or decode.
const SOUND_FILES = {
  move: 'assets/sounds/move.mp3',
  capture: 'assets/sounds/capture.mp3',
  select: 'assets/sounds/select.mp3',
  check: 'assets/sounds/check.mp3',
  error: 'assets/sounds/error.mp3',
  button: 'assets/sounds/button.mp3',
  victory: 'assets/sounds/victory.mp3',
  defeat: 'assets/sounds/defeat.mp3'
};

class ChessSounds {
  constructor() {
    this.audioContext = null;
    this.enabled = true;
    this.buffers = {};
    this.loadPromise = null;
  }

  init() {
    if (!this.audioContext) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      this.audioContext = new Ctor();
    }
    return this.audioContext;
  }

  // Mobile browsers only allow an AudioContext to start inside a user
  // gesture, and keep it suspended otherwise. Called from pointerdown.
  unlock() {
    const ctx = this.init();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled) this.unlock();
  }

  // Fetch and decode each sound once; failures keep the synth fallback.
  load() {
    if (this.loadPromise) return this.loadPromise;
    const ctx = this.init();
    if (!ctx) return Promise.resolve();
    this.loadPromise = Promise.all(
      Object.entries(SOUND_FILES).map(async ([name, url]) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return;
          const data = await res.arrayBuffer();
          this.buffers[name] = await ctx.decodeAudioData(data);
        } catch (e) { /* keep synth fallback for this sound */ }
      })
    );
    return this.loadPromise;
  }

  playBuffer(name, volume = 0.5) {
    const buffer = this.buffers[name];
    if (!buffer) return false;

    const source = this.audioContext.createBufferSource();
    const gainNode = this.audioContext.createGain();
    source.buffer = buffer;
    gainNode.gain.value = volume;
    source.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    source.start();
    return true;
  }

  // Prefer the downloaded file; until it is decoded, use the synth tone.
  play(name, synth, volume = 0.5) {
    if (!this.enabled) return;
    if (!this.unlock()) { synth.call(this); return; }
    this.load();
    if (this.playBuffer(name, volume)) return;
    synth.call(this);
  }

  playTone(frequency, duration, type = 'sine', volume = 0.3) {
    if (!this.enabled) return;
    if (!this.unlock()) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + duration);
  }

  playClick() {
    this.play('button', () => {
      this.playTone(800, 0.1, 'sine', 0.2);
      setTimeout(() => this.playTone(600, 0.05, 'sine', 0.15), 50);
    }, 0.4);
  }

  playSelect() {
    this.play('select', () => {
      this.playTone(400, 0.15, 'sine', 0.25);
      setTimeout(() => this.playTone(600, 0.1, 'sine', 0.2), 80);
    }, 0.5);
  }

  playMove() {
    this.play('move', () => {
      this.playTone(300, 0.2, 'sine', 0.3);
      setTimeout(() => this.playTone(450, 0.15, 'sine', 0.2), 100);
    }, 0.6);
  }

  playCapture() {
    this.play('capture', () => {
      this.playTone(200, 0.3, 'square', 0.2);
      setTimeout(() => this.playTone(300, 0.2, 'square', 0.15), 100);
      setTimeout(() => this.playTone(400, 0.15, 'sine', 0.2), 200);
    }, 0.7);
  }

  playCheck() {
    this.play('check', () => {
      this.playTone(500, 0.2, 'sawtooth', 0.2);
      setTimeout(() => this.playTone(700, 0.15, 'sawtooth', 0.15), 150);
      setTimeout(() => this.playTone(500, 0.2, 'sawtooth', 0.2), 300);
    }, 0.6);
  }

  playCheckmate() {
    this.play('victory', () => {
      const notes = [300, 400, 500, 600, 700, 800];
      notes.forEach((freq, i) => {
        setTimeout(() => this.playTone(freq, 0.3, 'sine', 0.25), i * 100);
      });
    }, 0.7);
  }

  playButton() {
    this.play('button', () => this.playTone(500, 0.1, 'sine', 0.15), 0.4);
  }

  playError() {
    this.play('error', () => {
      this.playTone(200, 0.3, 'sawtooth', 0.2);
      setTimeout(() => this.playTone(150, 0.3, 'sawtooth', 0.15), 150);
    }, 0.5);
  }

  playGameOver() {
    this.play('victory', () => {
      const notes = [800, 600, 400, 300];
      notes.forEach((freq, i) => {
        setTimeout(() => this.playTone(freq, 0.4, 'sine', 0.3), i * 200);
      });
    }, 0.7);
  }

  playDefeat() {
    this.play('defeat', () => {
      const notes = [400, 350, 300, 250];
      notes.forEach((freq, i) => {
        setTimeout(() => this.playTone(freq, 0.4, 'sine', 0.3), i * 200);
      });
    }, 0.7);
  }
}

window.chessSounds = new ChessSounds();
window.chessSounds.load();

// Light haptic feedback on devices that support it (no-op on iOS Safari).
window.chessHaptics = {
  buzz(pattern) {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
    }
  },
  select() { this.buzz(8); },
  move() { this.buzz(18); },
  capture() { this.buzz([12, 24, 22]); },
  error() { this.buzz([30, 40, 30]); }
};
