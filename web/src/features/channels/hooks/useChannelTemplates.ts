import { useState, useEffect, useCallback } from "react";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

export interface ChannelTemplate {
  id: string;
  name: string;
  description: string;
  defaultTopic: string;
  isPrivate: boolean;
}

const D_TAG = "channel-templates";

export function useChannelTemplates() {
  const [templates, setTemplates] = useState<ChannelTemplate[]>([]);

  useEffect(() => {
    const client = getRelayClient(relayWsUrl());
    const unsub = client.subscribe({
      id: D_TAG,
      filter: { kinds: [30078], "#d": [D_TAG], limit: 1 },
      onEvent: (raw) => {
        try {
          const data = JSON.parse(raw.content as string) as {
            templates: ChannelTemplate[];
          };
          setTemplates(data.templates ?? []);
        } catch {
          // ignore malformed events
        }
      },
    });
    return () => {
      unsub();
      setTemplates([]);
    };
  }, []);

  const publishTemplates = useCallback(
    async (newTemplates: ChannelTemplate[]) => {
      const signed = await signNostrEvent({
        kind: 30078,
        content: JSON.stringify({ templates: newTemplates }),
        tags: [["d", D_TAG]],
      });
      await getRelayClient(relayWsUrl()).publishAndWait(
        signed as Record<string, unknown>,
      );
      setTemplates(newTemplates);
    },
    [],
  );

  const addTemplate = useCallback(
    (t: Omit<ChannelTemplate, "id">) => {
      const newTemplates = [...templates, { ...t, id: crypto.randomUUID() }];
      return publishTemplates(newTemplates);
    },
    [templates, publishTemplates],
  );

  const removeTemplate = useCallback(
    (id: string) => {
      const newTemplates = templates.filter((t) => t.id !== id);
      return publishTemplates(newTemplates);
    },
    [templates, publishTemplates],
  );

  const updateTemplate = useCallback(
    (id: string, updates: Partial<ChannelTemplate>) => {
      const newTemplates = templates.map((t) =>
        t.id === id ? { ...t, ...updates } : t,
      );
      return publishTemplates(newTemplates);
    },
    [templates, publishTemplates],
  );

  return { templates, addTemplate, removeTemplate, updateTemplate };
}
