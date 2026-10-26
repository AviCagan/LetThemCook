// Chiptune-style sound effects synthesised with WebAudio. No sample files.
let ctx: AudioContext | null = null;
let muted = false;

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', gain = 0.08, when = 0, slide?: number): void {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  const t0 = c.currentTime + when;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain = 0.05, when = 0): void {
  const c = ac();
  if (!c) return;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = gain;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 1800;
  src.connect(f).connect(g).connect(c.destination);
  src.start(c.currentTime + when);
}

export const sfx = {
  setMuted(m: boolean): void {
    muted = m;
  },
  isMuted(): boolean {
    return muted;
  },
  tap(): void {
    tone(880, 0.05, 'square', 0.04);
  },
  pick(): void {
    tone(660, 0.06, 'square', 0.05);
    tone(990, 0.06, 'square', 0.04, 0.06);
  },
  pour(): void {
    noise(0.25, 0.03);
    tone(300, 0.2, 'sine', 0.02, 0, 420);
  },
  bubble(): void {
    tone(500 + Math.random() * 300, 0.08, 'sine', 0.03, 0, 900);
  },
  ding(): void {
    tone(1318, 0.12, 'triangle', 0.06);
    tone(1760, 0.18, 'triangle', 0.05, 0.1);
  },
  success(stars: number): void {
    const notes = [523, 659, 784, 1046];
    for (let i = 0; i < Math.min(4, stars + 1); i++) tone(notes[i], 0.14, 'square', 0.06, i * 0.1);
    if (stars === 3) tone(1318, 0.3, 'triangle', 0.06, 0.45);
  },
  fizzle(): void {
    noise(0.35, 0.05);
    tone(220, 0.3, 'sawtooth', 0.03, 0, 110);
  },
  puff(): void {
    noise(0.5, 0.06);
    tone(160, 0.4, 'square', 0.04, 0, 60);
  },
  coin(): void {
    tone(1200, 0.07, 'square', 0.05);
    tone(1600, 0.12, 'square', 0.05, 0.07);
  },
  click(): void {
    tone(1500, 0.03, 'square', 0.03);
  },
};
