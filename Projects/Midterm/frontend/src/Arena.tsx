import { memo, useEffect, useRef, useState, type RefObject } from "react";
import { soundtrack, unlockAudio } from "./audio";
import type { Room } from "./types";
import type { HitBurst } from "./useSession";
const keys = ["d", "f", "j", "k"];
const colors = ["#58ffd4", "#54cfff", "#d791ff", "#ffb556"];
type Props = {
  room: Room;
  offset: RefObject<number>;
  hitNotes: RefObject<Set<number>>;
  pendingNotes: RefObject<Set<number>>;
  miss: (message?: string) => void;
  burst: HitBurst | null;
  hit: (note: number, lane: number) => void;
  enabled: boolean;
  initialAudio: boolean;
};
export const Arena = memo(function Arena({
  room,
  offset,
  hitNotes,
  pendingNotes,
  miss,
  burst,
  hit,
  enabled,
  initialAudio,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const roomRef = useRef(room);
  roomRef.current = room;
  const pressed = useRef(new Set<number>());
  const [audio, setAudio] = useState(initialAudio);
  const [countdown, setCountdown] = useState("GET READY");
  useEffect(() => {
    function down(event: KeyboardEvent) {
      if (
        roomRef.current.status === "paused" ||
        roomRef.current.status === "abandoned"
      )
        return;
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
          !pendingNotes.current.has(i) &&
          delta < distance
        ) {
          closest = i;
          distance = delta;
        }
      });
      if (closest >= 0) hit(closest, lane);
      else if (time >= 0 && time < r.song.duration_ms) miss();
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
  }, [enabled, hit, hitNotes, pendingNotes, miss, offset]);
  useEffect(() => {
    if (!enabled) return;
    const initial = roomRef.current;
    const position = initial.starts_at
      ? (initial.paused_at
          ? Date.parse(initial.paused_at)
          : Date.now() + offset.current) - Date.parse(initial.starts_at)
      : -Infinity;
    // Skip historical misses when reopening a level. Only newly expired notes
    // trigger a burst, and pending inputs wait for their server judgement.
    let cursor = initial.song.chart.findIndex(
      (note) => note.time + 180 >= position,
    );
    if (cursor < 0) cursor = initial.song.chart.length;
    const timer = setInterval(() => {
      const current = roomRef.current;
      if (current.status !== "running" || !current.starts_at) return;
      const time = Date.now() + offset.current - Date.parse(current.starts_at);
      let missed = false;
      while (
        cursor < current.song.chart.length &&
        current.song.chart[cursor].time + 180 < time
      ) {
        if (!hitNotes.current.has(cursor) && !pendingNotes.current.has(cursor))
          missed = true;
        cursor++;
      }
      if (missed) miss("MISS · Note missed.");
    }, 25);
    return () => clearInterval(timer);
  }, [enabled, room.code, hitNotes, pendingNotes, miss, offset]);
  useEffect(() => setAudio(initialAudio), [initialAudio]);
  useEffect(() => {
    if (!audio || room.status !== "running" || !room.starts_at) return;
    return soundtrack(
      room.song,
      Date.parse(room.starts_at),
      () => Date.now() + offset.current,
    );
  }, [audio, room.code, room.status, room.starts_at, room.song.id, offset]);
  useEffect(() => {
    let frame = 0;
    let lastLabel = "";
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
      const time =
        (r.paused_at ? Date.parse(r.paused_at) : Date.now() + offset.current) -
        start;
      const laneWidth = width / 4;
      const line = 355;
      const label =
        r.status === "lobby"
          ? "PRACTICE YOUR KEYS"
          : r.status === "paused"
            ? "PAUSED"
            : r.status === "abandoned"
              ? "SESSION ENDED"
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
          ? "#423771"
          : lane % 2
            ? "#201a3b"
            : "#171c39";
        ctx.fillRect(lane * laneWidth + 1, 0, laneWidth - 2, height);
        ctx.fillStyle = colors[lane];
        ctx.globalAlpha = 0.6;
        ctx.fillRect(lane * laneWidth + 8, line, laneWidth - 16, 3);
        ctx.globalAlpha = 1;
        ctx.font = "bold 20px monospace";
        ctx.textAlign = "center";
        ctx.fillText(keys[lane].toUpperCase(), laneWidth * (lane + 0.5), 405);
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, width, line + 28);
      ctx.clip();
      if (r.status !== "lobby")
        r.song.chart.forEach((note, index) => {
          const y = line - (note.time - time) * 0.22;
          if (y < -15 || y > height || hitNotes.current.has(index)) return;
          ctx.fillStyle =
            note.time < time - 180 ? "#ff668d" : colors[note.lane];
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
      ctx.restore();
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
      <div className="instrument-stage">
        {burst && room.status === "running" && (
          <span
            key={burst.id}
            data-burst-id={burst.id}
            className={`hit-burst hit-burst--${burst.kind}`}
            aria-hidden="true"
          >
            {burst.kind === "perfect"
              ? "Perfect!"
              : burst.kind === "good"
                ? "Good!"
                : "Miss"}
          </span>
        )}
        {room.status === "paused" && (
          <div className="pause-overlay" role="status">
            <strong>Paused</strong>
            <span>Your song, notes, and accuracy are on hold.</span>
            <span>Use Resume above to keep playing.</span>
          </div>
        )}
        <canvas
          ref={canvas}
          className="note-canvas"
          role="img"
          aria-label="Notes descend in four lanes. Press D, F, J, K when a note reaches the green line."
        />
      </div>
      <p className="hint">
        Hit the line · <kbd>D</kbd> <kbd>F</kbd> <kbd>J</kbd> <kbd>K</kbd> ·
        Perfect ±80ms / Good ±180ms
      </p>
    </section>
  );
});
