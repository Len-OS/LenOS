import { useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_COMMUNITY_DEFINITION } from "@/shared/constants/kinds";

export interface WorkspaceBranding {
  avatar: string | null;
  accentColor: string | null;
}

export function useWorkspaceBranding(
  communityId: string | null,
): WorkspaceBranding {
  const [branding, setBranding] = useState<WorkspaceBranding>({
    avatar: null,
    accentColor: null,
  });

  useEffect(() => {
    if (!communityId) return;
    const client = getRelayClient(relayWsUrl());
    let latestCreatedAt = -1;

    const unsub = client.subscribe({
      id: `workspace-branding-${communityId}`,
      filter: {
        kinds: [KIND_COMMUNITY_DEFINITION],
        "#h": [communityId],
        limit: 1,
      },
      onEvent: (raw) => {
        const createdAt = (raw.created_at as number) ?? 0;
        if (createdAt < latestCreatedAt) return;
        latestCreatedAt = createdAt;

        const tags = (raw.tags as string[][]) ?? [];
        const picture = tags.find((t) => t[0] === "picture")?.[1] ?? null;
        const color = tags.find((t) => t[0] === "color")?.[1] ?? null;

        setBranding({
          avatar: picture ?? null,
          accentColor:
            color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : null,
        });
      },
    });

    return () => {
      unsub();
      setBranding({ avatar: null, accentColor: null });
      latestCreatedAt = -1;
    };
  }, [communityId]);

  return branding;
}
