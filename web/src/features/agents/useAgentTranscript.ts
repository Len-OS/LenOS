import { useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_AGENT_OBSERVER_FRAME } from "@/shared/constants/kinds";
import type { ActivityType } from "./ui/AgentActivityRow";

export interface TranscriptFrame {
  id: string;
  type: ActivityType;
  content: string;
  timestamp: number;
}

const VALID_TYPES = new Set<string>(["thought", "tool", "message", "plan", "command"]);

function parseActivityType(raw: string | undefined): ActivityType {
  if (raw && VALID_TYPES.has(raw)) return raw as ActivityType;
  return "message";
}

export function useAgentTranscript(sessionId: string | null): {
  frames: TranscriptFrame[];
  isLoading: boolean;
} {
  const [frames, setFrames] = useState<TranscriptFrame[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setFrames([]);
      return;
    }
    setIsLoading(true);
    setFrames([]);
    const client = getRelayClient(relayWsUrl());
    const timer = setTimeout(() => setIsLoading(false), 3000);

    const unsub = client.subscribe({
      id: `transcript-${sessionId}`,
      filter: {
        kinds: [KIND_AGENT_OBSERVER_FRAME],
        "#e": [sessionId],
        limit: 200,
      },
      onEvent: (raw) => {
        setIsLoading(false);
        const tags = (raw.tags as string[][]) ?? [];
        const type = parseActivityType(tags.find((t) => t[0] === "type")?.[1]);
        const frame: TranscriptFrame = {
          id: raw.id as string,
          type,
          content: (raw.content as string) || "",
          timestamp: raw.created_at as number,
        };
        setFrames((prev) => {
          if (prev.some((f) => f.id === frame.id)) return prev;
          return [...prev, frame].sort((a, b) => a.timestamp - b.timestamp);
        });
      },
    });

    return () => {
      unsub();
      clearTimeout(timer);
      setFrames([]);
    };
  }, [sessionId]);

  return { frames, isLoading };
}
