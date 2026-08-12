import { useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

export interface Channel {
  id: string;
  name: string;
  description: string;
  picture?: string;
  type?: string;
  visibility?: string;
  createdAt: number;
}

export function useChannels(communityId: string | null): Channel[] {
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    if (!communityId) return;

    const client = getRelayClient(relayWsUrl());
    const subId = `channels-${communityId}`;

    const unsub = client.subscribe({
      id: subId,
      filter: {
        kinds: [39000],
        limit: 200,
      },
      onEvent: (raw) => {
        const event = raw as {
          id: string;
          created_at: number;
          tags: string[][];
        };
        const tags = event.tags ?? [];
        const dTag = tags.find((t) => t[0] === "d")?.[1] ?? "";
        if (!dTag) return;
        const name =
          tags.find((t) => t[0] === "name")?.[1] ??
          tags.find((t) => t[0] === "n")?.[1] ??
          dTag;
        const description = tags.find((t) => t[0] === "about")?.[1] ?? "";
        const picture = tags.find((t) => t[0] === "picture")?.[1];
        const type = tags.find((t) => t[0] === "type")?.[1];
        const visibility = tags.find((t) => t[0] === "visibility")?.[1];

        setChannels((prev) => {
          const filtered = prev.filter((c) => c.id !== dTag);
          return [
            ...filtered,
            {
              id: dTag,
              name,
              description,
              picture,
              type,
              visibility,
              createdAt: event.created_at,
            },
          ].sort((a, b) => a.name.localeCompare(b.name));
        });
      },
    });

    return () => {
      unsub();
      setChannels([]);
    };
  }, [communityId]);

  return channels;
}
