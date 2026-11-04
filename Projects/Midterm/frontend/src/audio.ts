let context: AudioContext | null = null;
export async function unlockAudio() {
  context ??= new AudioContext();
  await context.resume();
}
export function audioContext() {
  return context;
}
export function tone(at: number, lane: number, accent = false) {
  if (!context || context.state !== "running") return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = [261.63, 329.63, 392, 523.25][lane];
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(accent ? 0.13 : 0.075, at + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.12);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(at);
  oscillator.stop(at + 0.14);
}
