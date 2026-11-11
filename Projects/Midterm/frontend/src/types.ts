import { z } from "zod";
export const UserSchema = z.object({ id: z.number(), username: z.string() });
export type User = z.infer<typeof UserSchema>;
const NoteSchema = z.object({
  time: z.number(),
  lane: z.number().int().min(0).max(3),
});
export const SongSchema = z.object({
  id: z.number(),
  title: z.string(),
  bpm: z.number(),
  difficulty: z.enum(["easy", "normal", "hard", "expert"]),
  arrangement: z.enum(["ambient", "house", "breakbeat"]),
  duration_ms: z.number(),
  chart: z.array(NoteSchema),
});
export type Song = z.infer<typeof SongSchema>;
export const PlayerSchema = z.object({
  user_id: z.number(),
  username: z.string(),
  ready: z.boolean(),
  score: z.number(),
  combo: z.number(),
  max_combo: z.number(),
  accuracy: z.number(),
  finished: z.boolean(),
});
export type Player = z.infer<typeof PlayerSchema>;
export const RoomSchema = z.object({
  code: z.string(),
  host_id: z.number(),
  mode: z.enum(["solo", "multiplayer"]),
  song: SongSchema,
  status: z.enum(["lobby", "running", "finished", "paused", "abandoned"]),
  starts_at: z.string().nullable(),
  paused_at: z.string().nullable(),
  participants: z.array(PlayerSchema),
});
export type Room = z.infer<typeof RoomSchema>;
export const TokensSchema = z.object({
  access: z.string(),
  refresh: z.string(),
});
export const LeaderboardSchema = z.array(
  z.object({
    user_id: z.number(),
    user__username: z.string(),
    best_accuracy: z.number(),
    song_id: z.number(),
    song_title: z.string(),
  }),
);
export const HistorySchema = z.array(
  z.object({
    code: z.string(),
    song: z.string(),
    score: z.number(),
    accuracy: z.number(),
    max_combo: z.number(),
    played_at: z.string(),
  }),
);
export const PacketSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("snapshot"),
    room: RoomSchema,
    server_time: z.string(),
    hit_notes: z.array(z.number()),
  }),
  z.object({
    type: z.literal("judgement"),
    grade: z.enum(["perfect", "good"]),
    delta_ms: z.number(),
    note: z.number(),
  }),
  z.object({
    type: z.literal("input_rejected"),
    note: z.number().int().nullable(),
    reason: z.enum([
      "timing",
      "wrong_lane",
      "duplicate",
      "out_of_order",
      "inactive",
    ]),
    message: z.string(),
  }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({ type: z.literal("pong"), server_time: z.string() }),
]);
export type Packet = z.infer<typeof PacketSchema>;
export const PageOfSongs = z.object({ results: z.array(SongSchema) });
