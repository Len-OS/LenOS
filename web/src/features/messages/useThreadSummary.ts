import { useState, useCallback } from "react";
import { relayHttpBaseUrl } from "@/shared/lib/relay-url";
import { makeNip98AuthHeader } from "@/shared/lib/nip98";
import type { Message } from "@/features/messages/use-messages";

interface SummaryState {
  summary: string | null;
  loading: boolean;
  error: string | null;
}

export function useThreadSummary(messages: Message[]) {
  const [state, setState] = useState<SummaryState>({
    summary: null,
    loading: false,
    error: null,
  });

  const summarize = useCallback(async () => {
    if (messages.length === 0) return;
    setState({ summary: null, loading: true, error: null });
    try {
      const url = `${relayHttpBaseUrl()}/api/thread-summary`;
      const body = JSON.stringify({
        messages: messages.map((m) => ({
          pubkey: m.pubkey,
          content: m.content,
          created_at: m.createdAt,
        })),
      });
      const authorization = await makeNip98AuthHeader(url, "POST", { body });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authorization },
        body,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { summary: string };
      setState({ summary: data.summary, loading: false, error: null });
    } catch (e) {
      setState({ summary: null, loading: false, error: "Failed to summarize thread." });
    }
  }, [messages]);

  const dismiss = useCallback(() => {
    setState({ summary: null, loading: false, error: null });
  }, []);

  return { ...state, summarize, dismiss };
}
