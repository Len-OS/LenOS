import { useCallback, useEffect, useState } from "react";
import { relayHttpUrl, relayWsUrl } from "@/shared/lib/relay-url";
import { makeNip98AuthHeader } from "@/shared/lib/nip98";

export interface Document {
  id: string;
  channel_id: string | null;
  filename: string;
  mime_type: string;
  byte_size: number;
  status: "processing" | "ready" | "failed";
  error: string | null;
  created_at: string;
}

export interface ChunkMatch {
  document_id: string;
  document_name: string;
  chunk_index: number;
  content: string;
  score: number;
}

function apiBase() {
  return relayHttpUrl(relayWsUrl());
}

export function useDocuments(channelId?: string) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url =
        `${apiBase()}/api/documents` +
        (channelId ? `?channel_id=${channelId}` : "");
      const auth = await makeNip98AuthHeader(url, "GET");
      const res = await fetch(url, {
        headers: { Authorization: auth },
      });
      if (!res.ok) throw new Error(await res.text());
      setDocuments(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upload = useCallback(
    async (file: File, targetChannelId?: string) => {
      const url = `${apiBase()}/api/documents`;
      const auth = await makeNip98AuthHeader(url, "POST");
      const form = new FormData();
      form.append("file", file);
      if (targetChannelId) {
        form.append("channel_id", targetChannelId);
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: auth },
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((body as { error?: string }).error ?? res.statusText);
      }
      // Poll until doc appears as ready or failed
      setTimeout(() => refresh(), 1500);
      return res.json() as Promise<{ document_id: string; status: string }>;
    },
    [refresh],
  );

  const remove = useCallback(async (id: string) => {
    const url = `${apiBase()}/api/documents/${id}`;
    const auth = await makeNip98AuthHeader(url, "DELETE");
    const res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: auth },
    });
    if (!res.ok) throw new Error(await res.text());
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }, []);

  return { documents, loading, error, refresh, upload, remove };
}

export async function searchDocuments(
  query: string,
  channelId?: string,
  limit = 5,
): Promise<ChunkMatch[]> {
  const base = apiBase();
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (channelId) params.set("channel_id", channelId);
  const url = `${base}/api/documents/search?${params}`;
  const auth = await makeNip98AuthHeader(url, "GET");
  const res = await fetch(url, { headers: { Authorization: auth } });
  if (!res.ok) throw new Error(await res.text());
  const body = (await res.json()) as { chunks: ChunkMatch[] };
  return body.chunks;
}
