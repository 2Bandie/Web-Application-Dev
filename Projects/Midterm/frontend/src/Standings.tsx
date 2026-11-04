import { useEffect, useRef } from "react";
import type { Player } from "./types";
const colors = ["#a6f5ba", "#9bcbff", "#d1b3ff", "#ffbd8a"];
export function Standings({
  players,
  total,
  userId,
}: {
  players: Player[];
  total: number;
  userId: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const playersRef = useRef(players);
  playersRef.current = players;
  useEffect(() => {
    let frame = 0;
    const positions = new Map<number, number>();
    function paint() {
      const canvas = ref.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const w = canvas.clientWidth;
      const ratio = devicePixelRatio || 1;
      canvas.width = w * ratio;
      canvas.height = 160 * ratio;
      ctx.scale(ratio, ratio);
      [...playersRef.current]
        .sort((a, b) => a.user_id - b.user_id)
        .forEach((p, i) => {
          const target = Math.min(1, p.score / total);
          const x =
            (positions.get(p.user_id) ?? 0) +
            (target - (positions.get(p.user_id) ?? 0)) * 0.1;
          positions.set(p.user_id, x);
          const y = 25 + i * 36;
          ctx.strokeStyle = "#35404a";
          ctx.beginPath();
          ctx.moveTo(12, y);
          ctx.lineTo(w - 12, y);
          ctx.stroke();
          ctx.fillStyle = colors[i % 4];
          ctx.beginPath();
          ctx.arc(16 + x * (w - 36), y, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#11151c";
          ctx.font = "bold 10px monospace";
          ctx.textAlign = "center";
          ctx.fillText(p.username[0].toUpperCase(), 16 + x * (w - 36), y + 3);
        });
      frame = requestAnimationFrame(paint);
    }
    paint();
    return () => cancelAnimationFrame(frame);
  }, [total]);
  return (
    <section className="panel standings">
      <div className="section-heading">
        <h2>Live standings</h2>
        <span className="tag">{players.length}/4 PLAYERS</span>
      </div>
      <canvas
        ref={ref}
        className="race-canvas"
        role="img"
        aria-label="Player avatars move along tracks as scores increase. Scores are listed below."
      />
      {[...players]
        .sort((a, b) => b.score - a.score || a.user_id - b.user_id)
        .map((p, i) => (
          <div className="player-row" key={p.user_id}>
            <span className="rank">{String(i + 1).padStart(2, "0")}</span>
            <div>
              <strong>
                {p.username}
                {p.user_id === userId ? " (you)" : ""}
              </strong>
              <small>
                {p.finished
                  ? `${p.accuracy.toFixed(1)}% accuracy`
                  : p.ready
                    ? "Ready to play"
                    : "Getting ready"}
              </small>
            </div>
            <strong className="score">{p.score.toLocaleString()}</strong>
          </div>
        ))}
      <p className="hint">
        Perfect = 1,000 pts · Good = 600 pts
        <br />
        Missed notes earn 0. Track distance reflects score.
      </p>
    </section>
  );
}
