// Public build configuration. Development uses Vite's same-origin proxy.
const configured = import.meta.env.VITE_BACKEND_URL?.trim();
const origin = configured ? new URL(configured).origin : "";
export function apiUrl(path: string): string {
  return `${origin}/api/${path}`;
}
export function socketUrl(code: string): string {
  const url = new URL(
    `/ws/rooms/${encodeURIComponent(code)}/`,
    origin || location.origin,
  );
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
