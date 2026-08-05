import { useState, useCallback } from "react";
import { getLastRead, setLastRead } from "./readStateStorage";

export function useReadState(channelId: string | null) {
  const [lastRead, setLastReadState] = useState<number>(
    channelId ? getLastRead(channelId) : 0,
  );

  const markRead = useCallback(
    (timestamp: number) => {
      if (!channelId) return;
      setLastRead(channelId, timestamp);
      setLastReadState(timestamp);
    },
    [channelId],
  );

  return { lastRead, markRead };
}
