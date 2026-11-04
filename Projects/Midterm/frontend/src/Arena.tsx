import { memo, useEffect, useRef, useState, type RefObject } from "react";
import { audioContext, tone, unlockAudio } from "./audio";
import type { Room } from "./types";
const keys = ["d", "f", "j", "k"];
const colors = ["#a6f5ba", "#9bcbff", "#d1b3ff", "#ffbd8a"];
type Props = {
  room: Room;
  offset: RefObject<number>;
  hitNotes: RefObject<Set<number>>;
  hit: (note: number, lane: number) => void;
  enabled: boolean;
};
export const Arena = memo(function Arena({
  room,
  offset,
  hitNotes,
  hit,
  enabled,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const roomRef = useRef(room);
  roomRef.current = room;
  const pressed = useRef(new Set<number>());
  const [audio, setAudio] = useState(false);
  const [countdown, setCountdown] = useState("GET READY");
  useEffect(() => {
    function down(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      const lane = keys.indexOf(event.key.toLowerCase());
      if (lane < 0) return;
      event.preventDefault();
      if (event.repeat) return;
      pressed.current.add(lane);
      play(lane);
    }
    function play(lane: number) {
      const r = roomRef.current;
      if (r.status !== "running" || !r.starts_at || !enabled) return;
      const time = Date.now() + offset.current - Date.parse(r.starts_at);
      let closest = -1;
      let distance = 181;
      r.song.chart.forEach((note, i) => {
        const delta = Math.abs(note.time - time);
        if (
          note.lane === lane &&
          !hitNotes.current.has(i) &&
          delta < distance
        ) {
          closest = i;
          distance = delta;
        }
      });
      if (closest >= 0) hit(closest, lane);
    }
    function up(event: KeyboardEvent) {
      pressed.current.delete(keys.indexOf(event.key.toLowerCase()));
    }
    function blur() {
      pressed.current.clear();
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [enabled, hit, hitNotes, offset]);
  useEffect(() => {
    let frame = 0;
    let lastLabel = "";
    const scheduled = new Set<number>();
    function draw() {
      const r = roomRef.current;
      const el = canvas.current;
      const ctx = el?.getContext("2d");
      if (!el || !ctx) return;
      const width = el.clientWidth;
      const height = 430;
      const ratio = window.devicePixelRatio || 1;
      if (el.width !== width * ratio || el.height !== height * ratio) {
        el.width = width * ratio;
        el.height = height * ratio;
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const start = r.starts_at ? Date.parse(r.starts_at) : Date.now() + 3000;
      const time = Date.now() + offset.current - start;
      const laneWidth = width / 4;
      const line = 355;
      const label =
        r.status === "lobby"
          ? "PRACTICE YOUR KEYS"
          : r.status === "finished"
            ? "TRACK COMPLETE"
            : time < 0
              ? String(Math.ceil(-time / 1000))
              : "ON THE BEAT";
      if (label !== lastLabel) {
        setCountdown(label);
        lastLabel = label;
      }
      for (let lane = 0; lane < 4; lane++) {
        ctx.fillStyle = pressed.current.has(lane)
          ? "#263a36"
          : lane % 2
            ? "#181f28"
            : "#151b23";
        ctx.fillRect(lane * laneWidth + 1, 0, laneWidth - 2, height);
        ctx.fillStyle = colors[lane];
        ctx.globalAlpha = 0.6;
        ctx.fillRect(lane * laneWidth + 8, line, laneWidth - 16, 3);
        ctx.globalAlpha = 1;
        ctx.font = "bold 20px monospace";
        ctx.textAlign = "center";
        ctx.fillText(keys[lane].toUpperCase(), laneWidth * (lane + 0.5), 405);
      }
      if (r.status !== "lobby")
        r.song.chart.forEach((note, index) => {
          if (r.status === "running" && audio && !scheduled.has(index)) {
            const seconds = (note.time - time) / 1000;
            const ac = audioContext();
            if (ac && seconds >= 0 && seconds < 0.15) {
              tone(ac.currentTime + seconds, note.lane, index % 4 === 0);
              scheduled.add(index);
            }
          }
          const y = line - (note.time - time) * 0.22;
          if (y < -15 || y > height || hitNotes.current.has(index)) return;
          ctx.fillStyle =
            note.time < time - 180 ? "#67434d" : colors[note.lane];
          ctx.beginPath();
          ctx.roundRect(
            note.lane * laneWidth + 12,
            y - 7,
            laneWidth - 24,
            14,
            4,
          );
          ctx.fill();
        });
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [audio, hitNotes, offset, room.code]);
  return (
    <section className="instrument" aria-label="Four lane rhythm game">
      <div className="instrument-top">
        <span className="eyebrow">{countdown}</span>
        <button
          className="text-button"
          onClick={() => {
            if (audio) setAudio(false);
            else
              void unlockAudio()
                .then(() => setAudio(true))
                .catch(() => setAudio(false));
          }}
        >
          {audio ? "♫ Audio on" : "Enable audio"}
        </button>
      </div>
      <canvas
        ref={canvas}
        className="note-canvas"
        role="img"
        aria-label="Notes descend in four lanes. Press D, F, J, K when a note reaches the green line."
      />
      <p className="hint">
        Hit the line · <kbd>D</kbd> <kbd>F</kbd> <kbd>J</kbd> <kbd>K</kbd> ·
        Perfect ±80ms / Good ±180ms
      </p>
    </section>
  );
});
