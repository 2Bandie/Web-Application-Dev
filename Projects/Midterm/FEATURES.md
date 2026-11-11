# Fifteen implemented features and grading evidence

The original typing competition becomes an accuracy-based rhythm game: characters → lane notes; typing accuracy → timing judgement; WPM → score/accuracy/combo; paragraph progress → live accuracy meters. The multiplayer/database/client-server engineering requirements remain.

| # | Feature / change | Where implemented | How to demonstrate | Rubric evidence |
| --- | --- | --- | --- | --- |
| 1 | Player registration and related profiles | `backend/arena/models.py`, `serializers.py` | Create a new account; weak/duplicate credentials fail clearly | One-to-One model, validation, migrations |
| 2 | JWT sign-in, refresh, and access guards | `backend/config/urls.py`, `frontend/src/auth.tsx`, `api.ts` | Sign in; anonymous protected API calls return 401 | DRF authentication + permissions, Context |
| 3 | Database-backed selectable rhythm charts | `backend/arena/migrations/0002_seed_tracks.py`, `0004_add_longer_tracks.py`, `models.py` | Choose any of four tracks, including 48-second Midnight Drive and 58-second expert Overdrive | JSON chart validation, read-only REST catalog, typed payloads |
| 4 | Code-based rooms with four-player capacity | `models.py`, `services.py`, `views.py` | Use Play solo to start privately, or create a multiplayer room; fifth player is rejected | Foreign Keys, Many-to-Many through Participation, transactions |
| 5 | Ready lobby and host-only controls | `services.py`, `App.tsx` | Everyone readies up; only the host can start | Role-based guards and validated state transitions |
| 6 | Shared three-second server countdown | `services.py`, `useSession.ts`, `Arena.tsx` | Both browsers start from the same server timestamp | Client-server coordination, clock calibration |
| 7 | Four-lane keyboard rhythm engine | `frontend/src/Arena.tsx` | Press D/F/J/K at the hit line; repeat events are ignored | Typed keyboard events, canvas rendering, ref-based frame state |
| 8 | Server-authoritative timing judgement | `backend/arena/services.py`, `consumers.py` | Perfect/good feedback; out-of-window and duplicate inputs fail | Transactional score engine, packet validation |
| 9 | Combos, weighted accuracy, and final results | `models.py`, `services.py`, `App.tsx` | Hit consecutive notes, skip one, inspect max combo and accuracy | Persistent calculations and idempotent finalization |
| 10 | Live multiplayer score distribution | `consumers.py`, `useSession.ts`, `Standings.tsx` | A hit immediately appears in the rival browser | Authenticated Channels groups + periodic authoritative snapshots |
| 11 | Live competitor accuracy meters | `frontend/src/Standings.tsx` | Percentages compare timing accuracy; everyone finishes together | Presentational component, accessible meters, accuracy-based ordering |
| 12 | Original synthesized audio and track difficulty | `frontend/src/audio.ts`, `Arena.tsx` | Enable audio; compare original melodies with house/breakbeat drums, bass, and 176 BPM expert streams | Web Audio scheduling, no external music service |
| 13 | Personal history and global per-song accuracy leaderboard | `backend/arena/views.py`, `frontend/src/App.tsx` | Finish a session and open Your records | Aggregate queries, related-model loading, typed API client |
| 14 | Live reconnection and state recovery | `frontend/src/useSession.ts`, `App.tsx` | Automatic socket reconnect; multiplayer users can rejoin by code | Backoff, JWT refresh, authoritative recovery snapshots |
| 15 | Accessible interface and resilient errors | `frontend/src/ErrorBoundary.tsx`, `api.ts`, `style.css`, `backend/arena/exceptions.py` | Invalid room code, unauthorized action, or stopped API shows an error; keyboard focus remains visible | Error boundary, role alerts, form validation, responsive layout, transaction error handling |

## Rubric crosswalk

- **Backend architecture & DB (20):** models and generated migrations; all three relationship kinds; unique constraints; validated charts and passwords; transactional services; related-object prefetching; aggregate leaderboard.
- **API & authentication (20):** DRF serializers, viewsets, router actions, JWT login/refresh, authenticated resources, member-only room retrieval, host-only start, origin-checked authenticated WebSockets.
- **React & TypeScript (20):** strict compiler settings; runtime Zod schemas; typed props, refs, state, and API responses; separated auth, networking, audio, game rendering, and standings modules; no explicit `any`.
- **State & API client (15):** authentication Context, centralized Fetch client, refresh deduplication, socket hook, refs for animation data, canvas animation without per-frame state churn.
- **Errors, UI & resilience (15):** form/API errors, standard HTTP status handling, DB rollback/conflict handling, reconnect snapshots, ErrorBoundary, focus indicators, input labels, canvas descriptions, textual score equivalents. A keyboard is required; full nonvisual gameplay has not been implemented.
- **Organization & Git (remaining rubric points):** separate backend/frontend, requirements/npm locks, local config examples, scripts, tests, formatting, and ignored generated files. The supplied rubric did not specify this dimension's numeric value. An honest incremental commit history is still your responsibility; no artificial history was created.

## Demonstration sequence

1. Show this checklist and model relationships.
2. Run backend tests and the strict frontend build.
3. Open two browser profiles with different accounts.
4. Create/join a room, ready up, start, and play several notes.
5. Point out live competitor accuracy meters and timing feedback.
6. Demonstrate automatic connection recovery; multiplayer players can rejoin using the shared code after a reload.
7. Finish, then show personal history and the global board.
8. Explain the single-worker/SQLite development limit and server-receive-time latency tradeoff.

See `README.md` for exact startup commands, API/socket formats, scoring math, and deployment boundaries.

## Latest additions

- Two longer tracks (hard Midnight Drive and expert Overdrive), with per-song difficulty and arrangement metadata.
- Dedicated one-click solo endpoint/UI, private sessions, automatic readiness/countdown, and saved solo results.
- Accuracy-first standings and song-specific leaderboard records; longer charts have no raw-points advantage.
- Synthesized kick, snare, hi-hats, bass, and chords scheduled independently of canvas rendering, with mute cleanup.
- Additive migrations, Windows update instructions, and tests for solo privacy/rollback, catalog density, live accuracy, ranking fairness, and browser playback.

## Solo playback and feedback update

Solo mode now includes Pause, Resume, Start over, and Quit level. The server freezes elapsed time and shifts the start timestamp on resume; audio/notes follow that authoritative state. Restart creates a clean attempt on the same song, and abandoned attempts are excluded from completed records. In-level paused state is preserved during socket reconnects; the saved-session picker has been removed. Multiplayer controls remain guarded.

Mistimed input now produces structured MISS feedback instead of raw Django validation output. Dedicated backend and browser tests cover these transitions, incomplete-result exclusion, and delayed input delivery.

## Visual polish update

Flat blue styling with yellow, green, and reddish-pink accents and a locally bundled rounded Nunito font, a simplified Feel the Beat heading, removed dashboard footer, larger Best Combo, and keyed Perfect!/Good!/Miss bursts with a quick bounce/fade. Expiring unplayed notes now trigger Miss feedback automatically, respecting pause and pending server judgements. Reduced-motion preferences use fade-only feedback. An additive migration renames the easy song to Glow while preserving existing chart and result relationships.
