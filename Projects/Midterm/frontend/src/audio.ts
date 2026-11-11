import type { Song } from "./types";
let context: AudioContext | null = null;
export async function unlockAudio() {
  context ??= new AudioContext();
  await context.resume();
}

// Look-ahead scheduling is independent of canvas frame rate. Each session owns
// its sources, so mute/replay/unmount also stops already-scheduled sounds.
export function soundtrack(
  song: Song,
  startsAt: number,
  serverNow: () => number,
) {
  const ac = context;
  if (!ac || ac.state !== "running") return () => {};
  const output = ac.createGain();
  output.gain.value = 0.55;
  const compressor = ac.createDynamicsCompressor();
  output.connect(compressor);
  compressor.connect(ac.destination);
  const sources = new Set<AudioScheduledSourceNode>();
  const beatMs = 60000 / song.bpm;
  const initialTime = serverNow() - startsAt;
  let step = Math.max(0, Math.floor((initialTime - 1500) / (beatMs / 2)));
  let noteIndex = 0;
  const noise = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  function voice(
    at: number,
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType = "sine",
    endFrequency?: number,
  ) {
    const source = ac!.createOscillator();
    const gain = ac!.createGain();
    source.type = type;
    source.frequency.setValueAtTime(frequency, at);
    if (endFrequency)
      source.frequency.exponentialRampToValueAtTime(
        endFrequency,
        at + duration,
      );
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(gain);
    gain.connect(output);
    sources.add(source);
    source.onended = () => {
      sources.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    source.start(at);
    source.stop(at + duration + 0.01);
  }
  function percussion(at: number, hat: boolean) {
    const source = ac!.createBufferSource();
    const gain = ac!.createGain();
    const filter = ac!.createBiquadFilter();
    source.buffer = noise;
    filter.type = "highpass";
    filter.frequency.value = hat ? 7500 : 1200;
    gain.gain.setValueAtTime(hat ? 0.09 : 0.24, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + (hat ? 0.045 : 0.13));
    source.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    sources.add(source);
    source.onended = () => {
      sources.delete(source);
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    source.start(at);
    source.stop(at + 0.2);
  }
  function schedule() {
    const elapsed = serverNow() - startsAt;
    if (elapsed >= song.duration_ms) return;
    while (
      1500 + (step * beatMs) / 2 <=
      Math.min(elapsed + 160, song.duration_ms - 500)
    ) {
      const ms = 1500 + (step * beatMs) / 2;
      if (ms >= elapsed) {
        const at = ac!.currentTime + (ms - elapsed) / 1000;
        if (song.arrangement !== "ambient") {
          const kick =
            song.arrangement === "house"
              ? step % 2 === 0
              : [0, 4, 7].includes(step % 8);
          if (kick) voice(at, 155, 0.22, 0.65, "sine", 42);
          if (step % 8 === 2 || step % 8 === 6) {
            percussion(at, false);
            voice(at, 180, 0.08, 0.12, "triangle");
          }
          percussion(at, true);
          if (step % 2 === 0) {
            const bass = [65.41, 51.91, 58.27, 49][Math.floor(step / 32) % 4];
            voice(at, bass, Math.min(0.25, beatMs / 1200), 0.15, "triangle");
          }
          if (step % 16 === 0) {
            const root = [130.81, 103.83, 116.54, 98][
              Math.floor(step / 32) % 4
            ];
            [1, 1.1892, 1.4983].forEach((ratio) =>
              voice(at, root * ratio, 0.7, 0.045, "triangle"),
            );
          }
        }
      }
      step++;
    }
    while (
      noteIndex < song.chart.length &&
      song.chart[noteIndex].time <= elapsed + 160
    ) {
      const note = song.chart[noteIndex++];
      if (note.time < elapsed) continue;
      const at = ac!.currentTime + (note.time - elapsed) / 1000;
      const frequency = [261.63, 329.63, 392, 523.25][note.lane];
      voice(
        at,
        frequency,
        0.12,
        song.arrangement === "ambient" ? 0.16 : 0.12,
        song.arrangement === "breakbeat" ? "triangle" : "sine",
      );
    }
  }
  schedule();
  const timer = setInterval(schedule, 25);
  return () => {
    clearInterval(timer);
    for (const source of sources) {
      source.stop();
      source.disconnect();
    }
    sources.clear();
    output.disconnect();
    compressor.disconnect();
  };
}
