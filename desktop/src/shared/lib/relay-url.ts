import { getCachedRelayOrigin } from "./mediaUrl";

/** Convert a WebSocket relay URL to its HTTP equivalent. */
export function relayHttpUrl(wsUrl: string): string {
  if (wsUrl.startsWith("wss://")) return `https://${wsUrl.slice(6)}`;
  if (wsUrl.startsWith("ws://")) return `http://${wsUrl.slice(5)}`;
  return wsUrl;
}

/** Current relay WebSocket URL derived from the cached relay origin. */
export function relayWsUrl(): string {
  const origin = getCachedRelayOrigin();
  if (!origin) return "";
  if (origin.startsWith("https://")) return `wss://${origin.slice(8)}`;
  if (origin.startsWith("http://")) return `ws://${origin.slice(7)}`;
  return origin;
}
