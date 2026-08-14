import { useState, useCallback } from "react";
import { getRelayHttpUrl, signRelayEvent } from "@/shared/api/tauri";

const NIP98_KIND = 27235;

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function nip98PostHeader(url: string, body: string): Promise<string> {
  const authEvent = await signRelayEvent({
    kind: NIP98_KIND,
    content: "",
    tags: [
      ["u", url],
      ["method", "POST"],
      ["payload", await sha256Hex(body)],
      ["nonce", crypto.randomUUID()],
    ],
  });
  return `Nostr ${btoa(JSON.stringify(authEvent))}`;
}

interface ThreadMsg {
  pubkey: string;
  content: string;
  createdAt: number;
}

interface SummaryState {
  summary: string | null;
  loading: boolean;
  error: string | null;
}

export function useThreadSummary(messages: ThreadMsg[]) {
  const [state, setState] = useState<SummaryState>({
    summary: null,
    loading: false,
    error: null,
  });

  const summarize = useCallback(async () => {
    if (messages.length === 0) return;
    setState({ summary: null, loading: true, error: null });
    try {
      const httpBase = await getRelayHttpUrl();
      const url = `${httpBase.replace(/\/+$/, "")}/api/thread-summary`;
      const body = JSON.stringify({
        messages: messages.map((m) => ({
          pubkey: m.pubkey,
          content: m.content,
          created_at: m.createdAt,
        })),
      });
      const authorization = await nip98PostHeader(url, body);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authorization },
        body,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { summary: string };
      setState({ summary: data.summary, loading: false, error: null });
    } catch {
      setState({ summary: null, loading: false, error: "Failed to summarize thread." });
    }
  }, [messages]);

  const dismiss = useCallback(() => {
    setState({ summary: null, loading: false, error: null });
  }, []);

  return { ...state, summarize, dismiss };
}
