import { z } from "zod";
import { TokensSchema } from "./types";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function describe(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(describe).join(" ");
  if (value !== null && typeof value === "object")
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${describe(item)}`)
      .join(" · ");
  return "Request failed.";
}
export function clearSession() {
  sessionStorage.removeItem("pulse.access");
  sessionStorage.removeItem("pulse.refresh");
}
export function saveTokens(tokens: z.infer<typeof TokensSchema>) {
  sessionStorage.setItem("pulse.access", tokens.access);
  sessionStorage.setItem("pulse.refresh", tokens.refresh);
}
let refreshing: Promise<string> | null = null;
export async function refreshAccess(): Promise<string> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const refresh = sessionStorage.getItem("pulse.refresh");
    if (!refresh) throw new ApiError(401, "Please sign in again.");
    const response = await fetch("/api/token/refresh/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
    if (!response.ok) {
      clearSession();
      throw new ApiError(
        401,
        "Your session expired. Sign out and sign in again.",
      );
    }
    const tokens = z
      .object({ access: z.string() })
      .parse(await response.json());
    sessionStorage.setItem("pulse.access", tokens.access);
    return tokens.access;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}
export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
  authenticated = true,
  retry = true,
): Promise<T> {
  let response: Response;
  try {
    const access = sessionStorage.getItem("pulse.access");
    response = await fetch(`/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authenticated && access
          ? { Authorization: `Bearer ${access}` }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(
      0,
      "Cannot reach the arena. Check that the server is running.",
    );
  }
  if (response.status === 401 && authenticated && retry) {
    await refreshAccess();
    return api(path, schema, body, authenticated, false);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const fallback: Record<number, string> = {
      401: "Please sign in again.",
      403: "You do not have permission.",
      404: "Room or resource not found.",
      429: "Too many requests. Try again shortly.",
      500: "Server error. Please try again.",
      503: "Database temporarily busy. Please try again.",
    };
    throw new ApiError(
      response.status,
      payload && response.status < 500
        ? describe(payload)
        : (fallback[response.status] ?? "Request failed."),
    );
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success)
    throw new ApiError(502, "The server returned an unexpected response.");
  return parsed.data;
}
export const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";
