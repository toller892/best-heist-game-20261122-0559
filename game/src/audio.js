// A tiny WebAudio synth for the game's blips: no audio files, no network.
// The context is created lazily on the first user gesture (browsers refuse
// sound before one), and every blip is one oscillator with a short envelope.

export function createAudio() {
  let context = null;
  let muted = false;

  function ensure() {
    if (context) return context;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
    } catch {
      context = null;
    }
    return context;
  }

  function blip(freq, seconds, type, gainValue, slideTo) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), now + seconds);
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + seconds + 0.02);
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    isMuted() {
      return muted;
    },
    /** A small gem picked up: a bright tick. */
    gem() {
      blip(1320, 0.09, 'sine', 0.12, 1760);
    },
    /** The Starlight Diamond: a little chime. */
    pickup() {
      blip(660, 0.16, 'triangle', 0.16, 990);
      setTimeout(() => blip(1320, 0.22, 'triangle', 0.14, 1760), 90);
    },
    /** A guard's vision just caught the thief: a short warning. */
    spotted() {
      blip(220, 0.25, 'square', 0.1, 440);
    },
    /** A tool was used: a soft puff. */
    tool() {
      blip(320, 0.14, 'sine', 0.1, 180);
    },
    /** Not enough gems for the tool: a dull thud. */
    denied() {
      blip(140, 0.12, 'square', 0.08, 110);
    },
    /** A room cleared: two rising notes. */
    roomClear() {
      blip(523, 0.14, 'triangle', 0.14, 523);
      setTimeout(() => blip(784, 0.2, 'triangle', 0.14, 784), 110);
    },
    /** Caught: a falling buzz. */
    caught() {
      blip(330, 0.5, 'sawtooth', 0.14, 70);
    },
    /** Clean getaway: a small fanfare. */
    win() {
      [523, 659, 784, 1047].forEach((freq, i) => {
        setTimeout(() => blip(freq, 0.22, 'triangle', 0.14, freq), i * 120);
      });
    },
  };
}
