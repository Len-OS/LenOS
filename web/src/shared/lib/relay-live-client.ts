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
  private authEventId: string | null = null;
  private pendingPublishes = new Map<
    string,
    {
      resolve: () => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(private readonly relayUrl: string) {}

  connect(): void {
    if (this.ws) return;
    this.authenticated = false;
    this.authEventId = null;
    const ws = new WebSocket(this.relayUrl);
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.reconnectDelay = 1_000;
      // Send subscriptions immediately so relays that issue NIP-42 AUTH only
      // after the first REQ can start the authentication handshake. Once AUTH
      // succeeds, sendAllSubs is called again with the authenticated session.
      this.sendAllSubs(ws);
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
          this.authEventId = signed.id;
          ws.send(JSON.stringify(["AUTH", signed]));
        } catch {
          // No NIP-07 — continue as read-only
          this.authEventId = null;
          this.sendAllSubs(ws);
        }
        return;
      }

      if (
        type === "OK" &&
        typeof msg[1] === "string" &&
        msg[1] === this.authEventId
      ) {
        // AUTH response — now send all pending subscriptions
        if (msg[2] === true) {
          this.authenticated = true;
          this.sendAllSubs(ws);
        } else {
          this.authenticated = false;
          this.authEventId = null;
          // Keep open-relay browsing usable when the relay rejects AUTH.
          this.sendAllSubs(ws);
        }
        return;
      }

      if (type === "OK" && typeof msg[1] === "string") {
        const pending = this.pendingPublishes.get(msg[1]);
        if (pending) {
          this.pendingPublishes.delete(msg[1]);
          clearTimeout(pending.timer);
          if (msg[2] === true) pending.resolve();
          else
            pending.reject(
              new Error(
                typeof msg[3] === "string" ? msg[3] : "Relay rejected event",
              ),
            );
        }
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
      this.authEventId = null;
      if (!this.destroyed) this.scheduleReconnect();
    });

    ws.addEventListener("error", () => ws.close());
  }

  subscribe(sub: Subscription): () => void {
    this.subs.set(sub.id, sub);
    // An initial REQ is also the trigger for NIP-42 on relays that challenge
    // subscriptions rather than idle connections.
    if (this.ws?.readyState === WebSocket.OPEN) {
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

  publishAndWait(event: Record<string, unknown>): Promise<void> {
    return this.publishAndWaitWhenReady(event);
  }

  private async publishAndWaitWhenReady(
    event: Record<string, unknown>,
  ): Promise<void> {
    const eventId = typeof event.id === "string" ? event.id : "";
    if (!eventId)
      return Promise.reject(new Error("Signed relay event is missing an id"));

    const deadline = Date.now() + 10_000;
    while (this.ws?.readyState !== WebSocket.OPEN || !this.authenticated) {
      if (Date.now() >= deadline) {
        throw new Error("Relay connection was not ready within 10 seconds");
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingPublishes.delete(eventId);
        reject(
          new Error("Relay did not acknowledge the event within 10 seconds"),
        );
      }, 10_000);
      this.pendingPublishes.set(eventId, { resolve, reject, timer });
      this.ws?.send(JSON.stringify(["EVENT", event]));
    });
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    for (const pending of this.pendingPublishes.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Relay connection closed"));
    }
    this.pendingPublishes.clear();
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
