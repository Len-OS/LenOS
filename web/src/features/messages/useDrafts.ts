import { useState, useCallback } from "react";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_STREAM_MESSAGE } from "@/shared/constants/kinds";

export interface Draft {
  id: string;
  channelId: string;
  threadRootId?: string;
  content: string;
  createdAt: number;
}

const DRAFTS_KEY = "lenos_drafts";

function readDrafts(): Draft[] {
  try {
    return JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? "[]") as Draft[];
  } catch {
    return [];
  }
}

function writeDrafts(drafts: Draft[]): void {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}

export function useDrafts() {
  const [drafts, setDrafts] = useState<Draft[]>(() => readDrafts());

  const saveDraft = useCallback(
    (data: Omit<Draft, "id" | "createdAt">): string => {
      const draft: Draft = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: Math.floor(Date.now() / 1000),
      };
      setDrafts((prev) => {
        const next = [...prev, draft];
        writeDrafts(next);
        return next;
      });
      return draft.id;
    },
    [],
  );

  const updateDraft = useCallback((id: string, content: string) => {
    setDrafts((prev) => {
      const next = prev.map((d) => (d.id === id ? { ...d, content } : d));
      writeDrafts(next);
      return next;
    });
  }, []);

  const deleteDraft = useCallback((id: string) => {
    setDrafts((prev) => {
      const next = prev.filter((d) => d.id !== id);
      writeDrafts(next);
      return next;
    });
  }, []);

  const sendDraft = useCallback(async (id: string): Promise<void> => {
    const current = readDrafts();
    const draft = current.find((d) => d.id === id);
    if (!draft) throw new Error("Draft not found");
    const tags: string[][] = [["h", draft.channelId]];
    if (draft.threadRootId) tags.push(["e", draft.threadRootId]);
    const signed = await signNostrEvent(
      { kind: KIND_STREAM_MESSAGE, content: draft.content, tags },
      { requireNip07: true },
    );
    await getRelayClient(relayWsUrl()).publishAndWait(
      signed as Record<string, unknown>,
    );
    setDrafts((prev) => {
      const next = prev.filter((d) => d.id !== id);
      writeDrafts(next);
      return next;
    });
  }, []);

  return { drafts, saveDraft, updateDraft, deleteDraft, sendDraft };
}
