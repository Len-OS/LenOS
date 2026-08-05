import { useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

const KIND_WORKFLOW = 30090;

export interface Workflow {
  id: string;
  eventId: string;
  name: string;
  description: string;
  trigger: string;
  communityId: string;
  createdAt: number;
}

export { KIND_WORKFLOW };
export const KIND_WORKFLOW_RUN = 9090;

export function useWorkflows(communityId: string | null): Workflow[] {
  const [workflows, setWorkflows] = useState<Map<string, Workflow>>(new Map());

  useEffect(() => {
    if (!communityId) return;
    const client = getRelayClient(relayWsUrl());

    const unsub = client.subscribe({
      id: `workflows-${communityId}`,
      filter: { kinds: [KIND_WORKFLOW], "#h": [communityId], limit: 200 },
      onEvent: (raw) => {
        const tags = (raw.tags as string[][]) ?? [];
        const id = tags.find((t) => t[0] === "d")?.[1] ?? (raw.id as string);
        const name = tags.find((t) => t[0] === "name")?.[1] ?? "Unnamed";
        const description = tags.find((t) => t[0] === "description")?.[1] ?? "";
        const trigger = tags.find((t) => t[0] === "trigger")?.[1] ?? "";
        const workflow: Workflow = {
          id,
          eventId: raw.id as string,
          name,
          description,
          trigger,
          communityId,
          createdAt: raw.created_at as number,
        };
        setWorkflows((prev) => {
          const next = new Map(prev);
          next.set(id, workflow);
          return next;
        });
      },
    });

    return () => {
      unsub();
      setWorkflows(new Map());
    };
  }, [communityId]);

  return Array.from(workflows.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
