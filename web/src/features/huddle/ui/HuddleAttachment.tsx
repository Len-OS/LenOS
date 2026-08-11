import { Headphones } from "lucide-react";
import { useEffect, useState } from "react";
import { useHuddle } from "../HuddleContext";
import {
  reconstructHuddleLifecycle,
  parseEphemeralChannelId,
  subscribeHuddleLifecycle,
  type LifecycleEvent,
} from "../lib/huddleLifecycle";
import { isHuddleStale } from "../lib/huddleCardState";

interface Props {
  channelId: string;
  startedEventContent: string;
  startedEventTags: string[][];
  startedAt: number;
  startedEventId: string;
  startedEventPubkey: string;
}

export function HuddleAttachment({
  channelId,
  startedEventContent,
  startedEventTags,
  startedAt,
  startedEventId,
  startedEventPubkey,
}: Props) {
  const { phase, joinHuddle, ephemeralChannelId: activeEph } = useHuddle();
  const [events, setEvents] = useState<LifecycleEvent[]>([
    {
      kind: 48100,
      content: startedEventContent,
      tags: startedEventTags,
      pubkey: startedEventPubkey,
      created_at: startedAt,
      id: startedEventId,
    },
  ]);

  const ephId = parseEphemeralChannelId(startedEventContent);
  const lifecycle = ephId
    ? reconstructHuddleLifecycle(events, channelId)
    : null;
  const ended = lifecycle?.ended ?? false;
  const count = lifecycle?.participants.size ?? 0;
  const stale = isHuddleStale(startedAt);
  const isIn = activeEph === ephId;
  const canJoin = !ended && !stale && !isIn && phase === "idle";

  useEffect(() => {
    if (!ephId) return;
    const store: LifecycleEvent[] = [...events];
    return subscribeHuddleLifecycle(channelId, store, setEvents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ephId, channelId]);

  return (
    <div className="my-1 flex items-center gap-3 rounded-xl border border-black/10 bg-black/[0.03] px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div
        className={
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full " +
          (ended ? "bg-black/10 dark:bg-white/10" : "bg-green-500/10")
        }
      >
        <Headphones
          className={
            "h-4 w-4 " +
            (ended ? "text-black/40 dark:text-white/40" : "text-green-500")
          }
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-black dark:text-white">
          {ended ? "Huddle — Ended" : "Huddle — In progress"}
        </p>
        <p className="text-xs text-black/50 dark:text-white/50">
          {count} participant{count !== 1 ? "s" : ""}
          {stale && !ended ? " — expired" : ""}
        </p>
      </div>
      {canJoin && (
        <button
          type="button"
          onClick={() => void joinHuddle(channelId, ephId!)}
          className="shrink-0 rounded-lg bg-green-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-600"
        >
          Join
        </button>
      )}
      {isIn && (
        <span className="shrink-0 rounded-lg bg-green-500/10 px-3 py-1.5 text-sm font-medium text-green-600 dark:text-green-400">
          Joined
        </span>
      )}
    </div>
  );
}
