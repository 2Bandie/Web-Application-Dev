import type { Player } from "./types";
export function Standings({
  players,
  userId,
  solo,
  finished,
  playing,
}: {
  players: Player[];
  userId: number;
  solo: boolean;
  finished: boolean;
  playing: boolean;
}) {
  return (
    <section className="panel standings">
      <div className="section-heading">
        <h2>{solo ? "Your accuracy" : "Accuracy standings"}</h2>
        <span className="tag">
          {solo ? "SOLO" : `${players.length}/4 PLAYERS`}
        </span>
      </div>
      {[...players]
        .sort((a, b) => b.accuracy - a.accuracy || a.user_id - b.user_id)
        .map((p, i) => (
          <div className="accuracy-player" key={p.user_id}>
            <div className="player-row">
              <span className="rank">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <strong>
                  {p.username}
                  {p.user_id === userId ? " (you)" : ""}
                </strong>
                <small>
                  {finished
                    ? "Final accuracy"
                    : playing
                      ? "Accuracy of judged notes"
                      : p.ready
                        ? "Ready to play"
                        : "Getting ready"}
                </small>
              </div>
              <strong className="accuracy-value">
                {p.accuracy.toFixed(1)}%
              </strong>
            </div>
            <div
              className="accuracy-meter"
              role="meter"
              aria-label={`${p.username} accuracy`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={p.accuracy}
            >
              <span style={{ width: `${p.accuracy}%` }} />
            </div>
            <small>
              <span className="score">{p.score.toLocaleString()}</span> pts ·{" "}
              {p.max_combo} best combo
            </small>
          </div>
        ))}
      <p className="hint">Perfect = 100% weight · Good = 60% · Miss = 0%</p>
    </section>
  );
}
