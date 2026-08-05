/** Convert a WebSocket relay URL to its HTTP equivalent. */
export function relayHttpUrl(wsUrl: string): string {
  if (wsUrl.startsWith("wss://")) {
    return `https://${wsUrl.slice(6)}`;
  }
  if (wsUrl.startsWith("ws://")) {
    return `http://${wsUrl.slice(5)}`;
  }
  return wsUrl;
}

export function relayWsUrl(): string {
  const configured = import.meta.env.VITE_RELAY_URL;
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const isWorkspaceHost = hostname.endsWith(".lengrowth.com") &&
    hostname.split(".").length >= 3 &&
    !["www", "app", "api", "relay", "growth-api", "lenos"].includes(hostname.split(".")[0]);
  if (isWorkspaceHost) return `wss://${hostname}`;
  return configured ?? "wss://relay.lengrowth.com";
}

/** HTTP base URL for the relay (derived from the WS URL). */
export function relayHttpBaseUrl(): string {
  return relayHttpUrl(relayWsUrl());
}
