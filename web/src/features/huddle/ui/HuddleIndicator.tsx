import { Headphones } from "lucide-react";
import { useEffect, useState } from "react";
import { useHuddle } from "../HuddleContext";
import {
  reconstructHuddleLifecycle,
  subscribeHuddleLifecycle,
  type LifecycleEvent,
} from "../lib/huddleLifecycle";
import { isHuddleStale } from "../lib/huddleCardState";

export function HuddleIndicator({ channelId }: { channelId: string }) {
  const {
    phase,
    startHuddle,
    joinHuddle,
    ephemeralChannelId: activeEph,
  } = useHuddle();
  const [events, setEvents] = useState<LifecycleEvent[]>([]);

  useEffect(() => {
    setEvents([]);
    const store: LifecycleEvent[] = [];
    const unsub = subscribeHuddleLifecycle(channelId, store, setEvents);
    return () => {
      unsub();
      setEvents([]);
    };
  }, [channelId]);

  const lifecycle = reconstructHuddleLifecycle(events, channelId);
  const active =
    lifecycle && !lifecycle.ended && !isHuddleStale(lifecycle.startedAt)
      ? lifecycle
      : null;

  const handleClick = () => {
    if (phase !== "idle") return;
    if (active) void joinHuddle(channelId, active.ephemeralChannelId);
    else void startHuddle(channelId);
  };

  const isInThis = active && activeEph === active.ephemeralChannelId;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={phase !== "idle" && !isInThis}
      title={
        active
          ? `Join huddle (${active.participants.size} in)`
          : "Start a huddle"
      }
      className={
        "relative rounded p-1.5 transition-colors disabled:opacity-40 " +
        (active
          ? "text-green-500 hover:bg-green-500/10"
          : "text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white")
      }
      aria-label={active ? "Join huddle" : "Start huddle"}
    >
      <Headphones className="h-4 w-4" />
      {active && active.participants.size > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-green-500 text-[9px] font-bold text-white">
          {active.participants.size}
        </span>
      )}
    </button>
  );
}
