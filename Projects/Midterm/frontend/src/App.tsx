import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, messageOf } from "./api";
import { useAuth } from "./auth";
import {
  HistorySchema,
  LeaderboardSchema,
  PageOfSongs,
  PageOfRooms,
  RoomSchema,
  type Room,
  type Song,
} from "./types";
import { useRace } from "./useRace";
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
      <div className="brand">
        <span className="brand-mark">≋</span>PULSE
        <span className="brand-sub">RHYTHM ARENA</span>
      </div>
      <section className="auth-card">
        <span className="eyebrow">FIND YOUR FREQUENCY</span>
        <h1>
          Good rhythm.
          <br />
          Great company.
        </h1>
        <p>
          Four lanes. One shared beat. Race your friends in a live rhythm
          showdown.
        </p>
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
            <span>↗</span>
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
      <p className="auth-footer">
        NO DOWNLOADS. NO LICENSED MUSIC. JUST THE BEAT.
      </p>
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
  const [board, setBoard] = useState<z.infer<typeof LeaderboardSchema>>([]);
  const [history, setHistory] = useState<z.infer<typeof HistorySchema>>([]);
  const [recent, setRecent] = useState<Room[]>([]);
  const [tab, setTab] = useState<"arena" | "records">("arena");
  const acceptRoom = useCallback((r: Room) => setRoom(r), []);
  const race = useRace(room?.code ?? null, acceptRoom);
  const loadRecords = useCallback(async () => {
    const [b, h, r] = await Promise.all([
      api("leaderboard/", LeaderboardSchema),
      api("history/", HistorySchema),
      api("rooms/", PageOfRooms),
    ]);
    setBoard(b);
    setHistory(h);
    setRecent(r.results);
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
  async function create() {
    setRoom(await api("rooms/", RoomSchema, { song_id: selected }));
    setTab("arena");
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
          <div>
            <span className="eyebrow">MULTIPLAYER / FOUR-KEY RHYTHM</span>
            <h1>
              {tab === "records"
                ? "The numbers behind the noise."
                : "A little friendly competition."}
            </h1>
            <p>Lock in. Catch the beat. Make every note count.</p>
          </div>
          <span className="season-tag">
            <span className="status-dot" /> ORIGINAL SYNTH TRACKS
          </span>
        </div>
        {(error || race.error) && (
          <div className="error" role="alert">
            {error || race.error}
            <button className="text-button" onClick={() => setError("")}>
              Dismiss
            </button>
          </div>
        )}
        {tab === "arena" ? (
          <>
            <div className="setup-grid">
              <section className="panel room-builder">
                <span className="eyebrow">01 / PICK YOUR TRACK</span>
                <h2>Set the tempo.</h2>
                <div className="track-options">
                  {songs.map((s) => (
                    <button
                      className={`track ${selected === s.id ? "selected" : ""}`}
                      key={s.id}
                      onClick={() => setSelected(s.id)}
                    >
                      <span className="track-art">
                        {s.bpm < 120 ? "≈" : "ϟ"}
                      </span>
                      <span>
                        <strong>{s.title}</strong>
                        <small>
                          {s.bpm} BPM · {s.chart.length} notes · 4 lanes
                        </small>
                      </span>
                      <span className="radio-dot" />
                    </button>
                  ))}
                </div>
                <button
                  disabled={busy || !selected || room?.status === "running"}
                  onClick={() => void task(create)}
                >
                  Create a room <span>↗</span>
                </button>
              </section>
              <section className="panel invite-panel">
                <span className="eyebrow">02 / BRING YOUR PEOPLE</span>
                <h2>Better with a rival.</h2>
                <p>
                  Create a room and share its code, or drop into a friend’s
                  lobby. Up to four players, one synchronized start.
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
                      disabled={busy || room?.status === "running"}
                    >
                      Join room
                    </button>
                  </div>
                </form>
                <p className="hint">
                  Solo runs work too. Each player needs a separate account.
                </p>
              </section>
            </div>
            {room ? (
              <>
                <div className="race-heading">
                  <div>
                    <span className="eyebrow">YOUR LIVE SESSION</span>
                    <h2>
                      {room.song.title}{" "}
                      <span className="tag">{room.status.toUpperCase()}</span>
                    </h2>
                  </div>
                  <div className="room-code">
                    ROOM <strong>{room.code}</strong>
                    <span
                      className={`connection ${race.connection === "live" ? "connected" : ""}`}
                    >
                      ● {race.connection}
                    </span>
                  </div>
                </div>
                <div className="game-grid">
                  <div>
                    <div className="race-controls">
                      {room.status === "lobby" && (
                        <>
                          <button
                            className="secondary"
                            disabled={busy || race.connection !== "live"}
                            onClick={() =>
                              void task(async () => {
                                await unlockAudio().catch(() => undefined);
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
                                race.connection !== "live" ||
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
                              Start race →
                            </button>
                          ) : (
                            <span className="hint">
                              Waiting for the host to start.
                            </span>
                          )}
                        </>
                      )}
                      {room.status === "running" && (
                        <span className="hint">
                          Race in progress. Missed notes cannot be replayed.
                        </span>
                      )}
                      {room.status === "finished" && (
                        <>
                          <strong>
                            Race complete · {self?.accuracy.toFixed(1)}%
                            accuracy
                          </strong>
                          <button onClick={() => void task(create)}>
                            Race again ↗
                          </button>
                        </>
                      )}
                    </div>
                    <Arena
                      room={room}
                      offset={race.offset}
                      hitNotes={race.hitNotes}
                      hit={race.hit}
                      enabled={race.connection === "live"}
                    />
                    <div className="feedback">
                      <span>
                        {race.feedback || "YOUR NEXT GREAT RUN STARTS HERE"}
                      </span>
                      <span>
                        BEST COMBO <strong>{self?.max_combo ?? 0}</strong>
                      </span>
                    </div>
                  </div>
                  <Standings
                    players={room.participants}
                    total={room.song.chart.length * 1000}
                    userId={user.id}
                  />
                </div>
              </>
            ) : (
              <div className="empty-arena">
                <span>◌</span>
                <div>
                  <h3>The stage is yours.</h3>
                  <p>Create or join a room to light up the track.</p>
                </div>
                <div className="key-preview">
                  <kbd>D</kbd>
                  <kbd>F</kbd>
                  <kbd>J</kbd>
                  <kbd>K</kbd>
                </div>
              </div>
            )}
            {recent.length > 0 && (
              <section className="recent">
                <h3>Return to a room</h3>
                <div className="recent-list">
                  {recent.slice(0, 6).map((r) => (
                    <button
                      className="secondary"
                      key={r.code}
                      disabled={busy || room?.status === "running"}
                      onClick={() =>
                        void task(async () =>
                          setRoom(await api(`rooms/${r.code}/`, RoomSchema)),
                        )
                      }
                    >
                      {r.code} · {r.song.title} · {r.status}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <div className="records-grid">
            <section className="panel">
              <span className="eyebrow">GLOBAL / ALL TIME</span>
              <h2>The high-score club.</h2>
              <p className="hint">
                Best completed score per player. Both tracks have 32 notes.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>Best score</th>
                  </tr>
                </thead>
                <tbody>
                  {board.map((p, i) => (
                    <tr key={p.user_id}>
                      <td>{i + 1}</td>
                      <td>{p.user__username}</td>
                      <td>{p.best_score.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {board.length === 0 && (
                <p>No completed runs yet. Set the first score.</p>
              )}
            </section>
            <section className="panel">
              <span className="eyebrow">YOUR LAST 20 RUNS</span>
              <h2>Every beat, on record.</h2>
              {history.length === 0 && (
                <p>Complete a race to start your history.</p>
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
        <footer>
          <span>MADE FOR THE MOMENT BETWEEN BEATS.</span>
          <span>32 notes · Server-verified scores · No pay-to-win</span>
        </footer>
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
