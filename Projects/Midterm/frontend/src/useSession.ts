import { useCallback, useEffect, useRef, useState } from "react";
import { PacketSchema, type Room } from "./types";
import { socketUrl } from "./backend";
import { refreshAccess } from "./api";
export type HitBurst = { id: number; kind: "perfect" | "good" | "miss" };
export function useSession(code: string | null, onRoom: (room: Room) => void) {
  const [connection, setConnection] = useState("offline");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [burst, setBurst] = useState<HitBurst | null>(null);
  const burstId = useRef(0);
  const showFeedback = useCallback(
    (kind: HitBurst["kind"], message: string) => {
      setFeedback(message);
      setBurst({ id: ++burstId.current, kind });
    },
    [],
  );
  useEffect(() => {
    if (!burst) return;
    const timer = setTimeout(() => setBurst(null), 650);
    return () => clearTimeout(timer);
  }, [burst]);
  const socket = useRef<WebSocket | null>(null);
  const offset = useRef(0);
  const hitNotes = useRef(new Set<number>());
  const pending = useRef(new Set<number>());
  const roomCallback = useRef(onRoom);
  roomCallback.current = onRoom;
  useEffect(() => {
    setError("");
    setFeedback("");
    setBurst(null);
    hitNotes.current = new Set();
    pending.current = new Set();
    if (!code) {
      setConnection("offline");
      return;
    }
    const roomCode = code;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let pingTime = 0;
    let calibrated = false;
    function connect() {
      if (cancelled) return;
      setConnection("connecting");
      const ws = new WebSocket(socketUrl(roomCode));
      socket.current = ws;
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "auth",
            token: sessionStorage.getItem("pulse.access"),
          }),
        );
      };
      ws.onmessage = (event) => {
        if (cancelled || typeof event.data !== "string") return;
        let json: unknown;
        try {
          json = JSON.parse(event.data);
        } catch {
          setError("Invalid server message.");
          return;
        }
        const parsed = PacketSchema.safeParse(json);
        if (!parsed.success) {
          setError("Unexpected server message.");
          return;
        }
        const p = parsed.data;
        if (p.type === "snapshot") {
          attempts = 0;
          setConnection("live");
          if (!calibrated) {
            offset.current = Date.parse(p.server_time) - Date.now();
            pingTime = Date.now();
            ws.send(JSON.stringify({ type: "ping" }));
          }
          hitNotes.current = new Set(p.hit_notes);
          roomCallback.current(p.room);
        } else if (p.type === "pong") {
          offset.current =
            Date.parse(p.server_time) - (pingTime + Date.now()) / 2;
          calibrated = true;
        } else if (p.type === "judgement") {
          hitNotes.current.add(p.note);
          pending.current.delete(p.note);
          showFeedback(
            p.grade,
            `${p.grade.toUpperCase()} · ${p.delta_ms > 0 ? "+" : ""}${p.delta_ms} ms`,
          );
        } else if (p.type === "input_rejected") {
          if (p.note !== null) pending.current.delete(p.note);
          if (
            p.reason === "timing" ||
            p.reason === "wrong_lane" ||
            p.reason === "out_of_order"
          ) {
            showFeedback("miss", `MISS · ${p.message}`);
          }
        } else {
          setError(p.message);
          pending.current.clear();
        }
      };
      ws.onclose = (event) => {
        if (cancelled) return;
        setConnection("reconnecting");
        pending.current.clear();
        calibrated = false;
        if (event.code === 4401) {
          if (attempts >= 2) {
            setConnection("offline");
            setError("Session or room access denied. Sign in again or rejoin.");
            return;
          }
          void refreshAccess()
            .then(() => {
              if (!cancelled) timer = setTimeout(connect, 1000);
            })
            .catch(() => {
              setConnection("offline");
              setError("Session expired. Sign out and sign in again.");
            });
          attempts++;
        } else {
          timer = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 10000));
        }
      };
      ws.onerror = () =>
        setError("Connection interrupted. Reconnecting automatically…");
    }
    connect();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      socket.current?.close();
      socket.current = null;
    };
  }, [code, showFeedback]);
  const hit = useCallback((note: number, lane: number) => {
    if (
      socket.current?.readyState !== WebSocket.OPEN ||
      pending.current.has(note) ||
      hitNotes.current.has(note)
    )
      return;
    pending.current.add(note);
    socket.current.send(JSON.stringify({ type: "hit", note, lane }));
  }, []);
  const miss = useCallback(
    (message = "MISS · No note at the hit line on this lane.") =>
      showFeedback("miss", message),
    [showFeedback],
  );
  const dismissError = useCallback(() => setError(""), []);
  return {
    connection,
    feedback,
    burst,
    error,
    offset,
    hitNotes,
    pendingNotes: pending,
    hit,
    miss,
    dismissError,
  };
}
