import { signNostrEvent } from "./nostr-signer";
import { makeAuthEvent } from "nostr-tools/nip42";

export interface Subscription {
  id: string;
  filter: Record<string, unknown>;
  onEvent: (event: Record<string, unknown>) => void;
  onEose?: () => void;
}

class RelayLiveClient {
  private ws: WebSocket | null = null;
  private subs = new Map<string, Subscription>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1_000;
  private destroyed = false;
  private authenticated = false;

  constructor(private readonly relayUrl: string) {}

  connect(): void {
    if (this.ws) return;
    this.authenticated = false;
    const ws = new WebSocket(this.relayUrl);
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.reconnectDelay = 1_000;
      // Re-subscribe after reconnect (AUTH will re-trigger sendAllSubs)
    });

    ws.addEventListener("message", async (evt) => {
      let msg: unknown;
      try {
        msg = JSON.parse(String(evt.data));
      } catch {
        return;
      }
      if (!Array.isArray(msg)) return;

      const [type] = msg as [string, ...unknown[]];

      if (type === "AUTH" && typeof msg[1] === "string") {
        const challenge = msg[1] as string;
        const template = makeAuthEvent(this.relayUrl, challenge);
        try {
          const signed = await signNostrEvent(template);
          ws.send(JSON.stringify(["AUTH", signed]));
        } catch {
          // No NIP-07 — continue as read-only
          this.sendAllSubs(ws);
        }
        return;
      }

      if (type === "OK" && !this.authenticated) {
        // AUTH response — now send all pending subscriptions
        this.authenticated = true;
        this.sendAllSubs(ws);
        return;
      }

      if (type === "EVENT" && typeof msg[1] === "string") {
        const subId = msg[1] as string;
        const sub = this.subs.get(subId);
        if (sub && msg[2]) sub.onEvent(msg[2] as Record<string, unknown>);
        return;
      }

      if (type === "EOSE" && typeof msg[1] === "string") {
        const sub = this.subs.get(msg[1] as string);
        sub?.onEose?.();
        return;
      }
    });

    ws.addEventListener("close", () => {
      this.ws = null;
      this.authenticated = false;
      if (!this.destroyed) this.scheduleReconnect();
    });

    ws.addEventListener("error", () => ws.close());
  }

  subscribe(sub: Subscription): () => void {
    this.subs.set(sub.id, sub);
    if (this.ws?.readyState === WebSocket.OPEN && this.authenticated) {
      this.ws.send(JSON.stringify(["REQ", sub.id, sub.filter]));
    }
    return () => this.unsubscribe(sub.id);
  }

  unsubscribe(id: string): void {
    this.subs.delete(id);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(["CLOSE", id]));
    }
  }

  publish(event: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(["EVENT", event]));
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  private sendAllSubs(ws: WebSocket): void {
    for (const sub of this.subs.values()) {
      ws.send(JSON.stringify(["REQ", sub.id, sub.filter]));
    }
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
    }, this.reconnectDelay);
  }
}

const clients = new Map<string, RelayLiveClient>();

export function getRelayClient(relayUrl: string): RelayLiveClient {
  let client = clients.get(relayUrl);
  if (!client) {
    client = new RelayLiveClient(relayUrl);
    client.connect();
    clients.set(relayUrl, client);
  }
  return client;
}
