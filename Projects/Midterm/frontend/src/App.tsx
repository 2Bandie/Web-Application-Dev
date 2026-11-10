import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, messageOf } from "./api";
import { useAuth } from "./auth";
import {
  HistorySchema,
  LeaderboardSchema,
  PageOfSongs,
  RoomSchema,
  type Room,
  type Song,
} from "./types";
import { useSession } from "./useSession";
import { Arena } from "./Arena";
import { Standings } from "./Standings";
import { unlockAudio } from "./audio";
import type { z } from "zod";
function AuthScreen() {
  const { signIn, error: sessionError } = useAuth();
  const [register, setRegister] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await signIn(
        String(data.get("username")).trim(),
        String(data.get("password")),
        register,
      );
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1 className="brand auth-brand">
          <span className="brand-mark" aria-hidden="true">
            ≋
          </span>
          Pulse
        </h1>
        <p className="auth-tagline">Find your frequency</p>
        <form onSubmit={(e) => void submit(e)}>
          <label>
            Username
            <input
              name="username"
              required
              autoComplete="username"
              maxLength={150}
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={register ? 8 : 1}
              maxLength={128}
              autoComplete={register ? "new-password" : "current-password"}
            />
          </label>
          {register && (
            <small>
              Use at least 8 characters; avoid common or entirely numeric
              passwords.
            </small>
          )}
          <button disabled={busy}>
            {busy
              ? "Connecting…"
              : register
                ? "Create account"
                : "Enter the arena"}{" "}
            <span>→</span>
          </button>
        </form>
        <button
          className="text-button"
          onClick={() => {
            setRegister(!register);
            setError("");
          }}
        >
          {register
            ? "Already a player? Sign in"
            : "New here? Create an account"}
        </button>
        {(error || sessionError) && (
          <p className="error" role="alert">
            {error || sessionError}
          </p>
        )}
      </section>
    </main>
  );
}
function Dashboard() {
  const { user, signOut } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [board, setBoard] = useState<z.infer<typeof LeaderboardSchema>>([]);
  const [history, setHistory] = useState<z.infer<typeof HistorySchema>>([]);
  const [tab, setTab] = useState<"arena" | "records">("arena");
  const acceptRoom = useCallback(
    (r: Room) => setRoom((current) => (current?.code === r.code ? r : current)),
    [],
  );
  const session = useSession(room?.code ?? null, acceptRoom);
  const loadRecords = useCallback(async () => {
    const [b, h] = await Promise.all([
      api("leaderboard/", LeaderboardSchema),
      api("history/", HistorySchema),
    ]);
    setBoard(b);
    setHistory(h);
  }, []);
  useEffect(() => {
    void api("songs/", PageOfSongs)
      .then((p) => {
        setSongs(p.results);
        setSelected(p.results[0]?.id ?? 0);
      })
      .catch((e) => setError(messageOf(e)));
    void loadRecords().catch((e) => setError(messageOf(e)));
  }, [loadRecords]);
  useEffect(() => {
    if (room?.status === "finished")
      void loadRecords().catch((e) => setError(messageOf(e)));
  }, [room?.status, loadRecords]);
  useEffect(() => {
    if (room?.status === "running") {
      document.querySelector(".session-heading")?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    }
  }, [room?.code, room?.status]);
  async function task(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  async function create(solo = false) {
    if (solo)
      await unlockAudio()
        .then(() => setAudioEnabled(true))
        .catch(() => setAudioEnabled(false));
    setRoom(
      await api(solo ? "rooms/solo/" : "rooms/", RoomSchema, {
        song_id: selected,
      }),
    );
    setTab("arena");
  }
  async function controlSolo(action: "pause" | "resume" | "restart" | "quit") {
    if (!room) return;
    if (action === "resume" || action === "restart")
      await unlockAudio().catch(() => undefined);
    const updated = await api(`rooms/${room.code}/${action}/`, RoomSchema, {});
    if (action === "quit") {
      setRoom(null);
      void loadRecords().catch((e) => setError(messageOf(e)));
      document
        .querySelector(".room-builder")
        ?.scrollIntoView({ block: "start" });
    } else setRoom(updated);
  }
  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code"))
      .trim()
      .toUpperCase();
    await task(async () => {
      setRoom(
        await api(`rooms/${encodeURIComponent(code)}/join/`, RoomSchema, {}),
      );
      setTab("arena");
    });
  }
  if (!user) return null;
  const self = room?.participants.find((p) => p.user_id === user.id);
  const host = room?.host_id === user.id;
  return (
    <div className="app-shell">
      <header>
        <a className="brand" href="/" onClick={(e) => e.preventDefault()}>
          <span className="brand-mark">≋</span>PULSE
          <span className="brand-sub">RHYTHM ARENA</span>
        </a>
        <nav aria-label="Main navigation">
          <button
            className={tab === "arena" ? "nav-active" : ""}
            onClick={() => setTab("arena")}
          >
            Play arena
          </button>
          <button
            className={tab === "records" ? "nav-active" : ""}
            onClick={() => {
              setTab("records");
              void task(loadRecords);
            }}
          >
            Your records
          </button>
        </nav>
        <div className="account">
          <span className="avatar">{user.username[0].toUpperCase()}</span>
          <span>{user.username}</span>
          <button className="text-button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <main>
        <div className="page-heading">
          <h1>Feel the Beat</h1>
        </div>
        {(error || session.error) && (
          <div className="error" role="alert">
            {error || session.error}
            <button
              className="text-button"
              onClick={() => {
                setError("");
                session.dismissError();
              }}
            >
              Dismiss
            </button>
          </div>
        )}
        {tab === "arena" ? (
          <>
            <div className="setup-grid">
              <section className="panel room-builder">
                <h2 className="panel-title">PICK YOUR TRACK</h2>
                <div className="track-options">
                  {songs.map((s) => (
                    <button
                      className={`track ${selected === s.id ? "selected" : ""}`}
                      key={s.id}
                      aria-pressed={selected === s.id}
                      onClick={() => setSelected(s.id)}
                    >
                      <span className="track-art">
                        {s.bpm < 120 ? "≈" : "ϟ"}
                      </span>
                      <span>
                        <strong>{s.title}</strong>
                        <small>
                          {s.difficulty.toUpperCase()} · {s.bpm} BPM
                          <br />
                          {Math.round(s.duration_ms / 1000)} sec ·{" "}
                          {s.chart.length} notes
                        </small>
                      </span>
                      <span className="radio-dot" />
                    </button>
                  ))}
                </div>
                <div className="play-options">
                  <button
                    disabled={
                      busy ||
                      !selected ||
                      room?.status === "running" ||
                      room?.status === "paused"
                    }
                    onClick={() => void task(() => create(true))}
                  >
                    Play solo <span>→</span>
                  </button>
                  <button
                    className="secondary"
                    disabled={
                      busy ||
                      !selected ||
                      room?.status === "running" ||
                      room?.status === "paused"
                    }
                    onClick={() => void task(() => create())}
                  >
                    Create multiplayer room <span>＋</span>
                  </button>
                </div>
                <p className="hint">
                  Solo starts your selected song immediately after a countdown.
                  No room code or ready button needed.
                </p>
              </section>
              <section className="panel invite-panel">
                <h2 className="panel-title">PLAY WITH OTHERS</h2>
                <p>
                  Create a room and share the room code, or play in another
                  friend’s lobby. Up to four players.
                </p>
                <form onSubmit={(e) => void join(e)}>
                  <label htmlFor="room-code">Room code</label>
                  <div className="join-row">
                    <input
                      id="room-code"
                      name="code"
                      placeholder="E.G. A1B2C3D4"
                      pattern="[a-fA-F0-9]{8}"
                      maxLength={8}
                      required
                      autoComplete="off"
                    />
                    <button
                      className="secondary"
                      disabled={
                        busy ||
                        room?.status === "running" ||
                        room?.status === "paused"
                      }
                    >
                      Join room
                    </button>
                  </div>
                </form>
                <p className="hint">
                  Choose Play solo for single-player. Multiplayer needs a
                  separate account per player.
                </p>
              </section>
            </div>
            {room ? (
              <>
                <div className="session-heading">
                  <div>
                    <span className="eyebrow">YOUR LIVE SESSION</span>
                    <h2>
                      {room.song.title}{" "}
                      <span className="tag">{room.status.toUpperCase()}</span>
                    </h2>
                  </div>
                  <div className="room-code">
                    {room.mode === "solo" ? (
                      "SOLO PLAY"
                    ) : (
                      <>
                        ROOM <strong>{room.code}</strong>
                      </>
                    )}
                    <span
                      className={`connection ${session.connection === "live" ? "connected" : ""}`}
                    >
                      ● {session.connection}
                    </span>
                  </div>
                </div>
                <div className="game-grid">
                  <div>
                    <div className="session-controls">
                      {room.mode === "solo" &&
                        (room.status === "running" ||
                          room.status === "paused") && (
                          <div
                            className="solo-controls"
                            aria-label="Solo playback controls"
                          >
                            <button
                              disabled={busy || session.connection !== "live"}
                              onClick={() =>
                                void task(() =>
                                  controlSolo(
                                    room.status === "paused"
                                      ? "resume"
                                      : "pause",
                                  ),
                                )
                              }
                            >
                              {room.status === "paused" ? "Resume" : "Pause"}
                            </button>
                            <button
                              className="secondary"
                              disabled={busy}
                              onClick={() =>
                                void task(() => controlSolo("restart"))
                              }
                            >
                              Start over
                            </button>
                            <button
                              className="secondary"
                              disabled={busy}
                              onClick={() =>
                                void task(() => controlSolo("quit"))
                              }
                            >
                              Quit level
                            </button>
                          </div>
                        )}
                      {room.status === "lobby" && (
                        <>
                          <button
                            className="secondary"
                            disabled={busy || session.connection !== "live"}
                            onClick={() =>
                              void task(async () => {
                                await unlockAudio()
                                  .then(() => setAudioEnabled(true))
                                  .catch(() => undefined);
                                setRoom(
                                  await api(
                                    `rooms/${room.code}/ready/`,
                                    RoomSchema,
                                    { ready: !self?.ready },
                                  ),
                                );
                              })
                            }
                          >
                            {self?.ready ? "Unready" : "Ready up"}
                          </button>
                          {host ? (
                            <button
                              disabled={
                                busy ||
                                session.connection !== "live" ||
                                !room.participants.every((p) => p.ready)
                              }
                              onClick={() =>
                                void task(async () => {
                                  setRoom(
                                    await api(
                                      `rooms/${room.code}/start/`,
                                      RoomSchema,
                                      {},
                                    ),
                                  );
                                })
                              }
                            >
                              Start song →
                            </button>
                          ) : (
                            <span className="hint">
                              Waiting for the host to start.
                            </span>
                          )}
                        </>
                      )}
                      {room.mode !== "solo" && room.status === "running" && (
                        <span className="hint">
                          Song in progress. Missed notes cannot be replayed.
                        </span>
                      )}
                      {room.status === "finished" && (
                        <>
                          <strong>
                            Song complete · {self?.accuracy.toFixed(1)}%
                            accuracy
                          </strong>
                          <button
                            onClick={() =>
                              void task(() => create(room.mode === "solo"))
                            }
                          >
                            Play again →
                          </button>
                        </>
                      )}
                    </div>
                    <Arena
                      key={room.code}
                      initialAudio={audioEnabled}
                      room={room}
                      offset={session.offset}
                      hitNotes={session.hitNotes}
                      pendingNotes={session.pendingNotes}
                      miss={session.miss}
                      burst={session.burst}
                      hit={session.hit}
                      enabled={session.connection === "live"}
                    />
                    <div className="feedback">
                      <span role="status" aria-live="polite">
                        {session.feedback || "YOUR NEXT GREAT RUN STARTS HERE"}
                      </span>
                      <span>
                        BEST COMBO <strong>{self?.max_combo ?? 0}</strong>
                      </span>
                    </div>
                  </div>
                  <Standings
                    players={room.participants}
                    solo={room.mode === "solo"}
                    finished={room.status === "finished"}
                    playing={
                      room.status === "running" || room.status === "paused"
                    }
                    userId={user.id}
                  />
                </div>
              </>
            ) : (
              <div className="empty-arena">
                <span>◌</span>
                <div>
                  <h3>The stage is yours.</h3>
                  <p>
                    Pick a song and play solo, or invite friends to compare
                    accuracy.
                  </p>
                </div>
                <div className="key-preview">
                  <kbd>D</kbd>
                  <kbd>F</kbd>
                  <kbd>J</kbd>
                  <kbd>K</kbd>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="records-grid">
            <section className="panel">
              <span className="eyebrow">GLOBAL / ALL TIME</span>
              <h2>The accuracy leaderboard.</h2>
              <p className="hint">
                Best completed accuracy per player and song. Compare
                performances on the same track.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>Song</th>
                    <th>Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {board.map((p, i) => (
                    <tr key={`${p.user_id}-${p.song_id}`}>
                      <td>{i + 1}</td>
                      <td>{p.user__username}</td>
                      <td>{p.song_title}</td>
                      <td>{p.best_accuracy.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {board.length === 0 && (
                <p>No completed songs yet. Set the first accuracy record.</p>
              )}
            </section>
            <section className="panel">
              <span className="eyebrow">YOUR LAST 20 RUNS</span>
              {history.length === 0 && (
                <p>Complete a song to start your history.</p>
              )}
              {history.map((h) => (
                <div className="history-row" key={h.code}>
                  <div>
                    <strong>{h.song}</strong>
                    <small>
                      {new Date(h.played_at).toLocaleString()} · {h.max_combo}{" "}
                      max combo
                    </small>
                  </div>
                  <div>
                    <strong>{h.score.toLocaleString()}</strong>
                    <small>{h.accuracy.toFixed(1)}% accuracy</small>
                  </div>
                </div>
              ))}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
export default function App() {
  const { user, loading } = useAuth();
  return loading ? (
    <main className="auth-card" role="status">
      Tuning the arena…
    </main>
  ) : user ? (
    <Dashboard />
  ) : (
    <AuthScreen />
  );
}
