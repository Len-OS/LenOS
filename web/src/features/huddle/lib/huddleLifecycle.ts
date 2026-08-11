import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import {
  KIND_HUDDLE_STARTED,
  KIND_HUDDLE_PARTICIPANT_JOINED,
  KIND_HUDDLE_PARTICIPANT_LEFT,
  KIND_HUDDLE_ENDED,
} from "@/shared/constants/kinds";

export interface HuddleLifecycle {
  ephemeralChannelId: string;
  participants: Set<string>;
  ended: boolean;
  startedAt: number;
}

export type LifecycleEvent = {
  kind: number;
  content: string;
  tags: string[][];
  pubkey: string;
  created_at: number;
  id: string;
};

export function parseEphemeralChannelId(content: string): string | null {
  try {
    return (
      (JSON.parse(content) as { ephemeral_channel_id?: string })
        .ephemeral_channel_id ?? null
    );
  } catch {
    return null;
  }
}

export function reconstructHuddleLifecycle(
  events: LifecycleEvent[],
  _parentChanId: string,
): HuddleLifecycle | null {
  const order: Record<number, number> = {
    [KIND_HUDDLE_STARTED]: 0,
    [KIND_HUDDLE_PARTICIPANT_JOINED]: 1,
    [KIND_HUDDLE_PARTICIPANT_LEFT]: 2,
    [KIND_HUDDLE_ENDED]: 3,
  };
  const sorted = [...events].sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at - b.created_at;
    const ao = order[a.kind] ?? 99;
    const bo = order[b.kind] ?? 99;
    return ao !== bo ? ao - bo : a.id.localeCompare(b.id);
  });

  const started = sorted.find((e) => e.kind === KIND_HUDDLE_STARTED);
  if (!started) return null;
  const ephemeralChannelId = parseEphemeralChannelId(started.content);
  if (!ephemeralChannelId) return null;

  const participants = new Set<string>();
  let ended = false;

  for (const ev of sorted) {
    if (parseEphemeralChannelId(ev.content) !== ephemeralChannelId) continue;
    const pk = (ev.tags as string[][]).find((t) => t[0] === "p")?.[1];
    if (ev.kind === KIND_HUDDLE_PARTICIPANT_JOINED && pk) participants.add(pk);
    else if (ev.kind === KIND_HUDDLE_PARTICIPANT_LEFT && pk)
      participants.delete(pk);
    else if (ev.kind === KIND_HUDDLE_ENDED) ended = true;
  }

  return {
    ephemeralChannelId,
    participants,
    ended,
    startedAt: started.created_at,
  };
}

export function subscribeHuddleLifecycle(
  parentChanId: string,
  store: LifecycleEvent[],
  onUpdate: (evs: LifecycleEvent[]) => void,
): () => void {
  return getRelayClient(relayWsUrl()).subscribe({
    id: "huddle-lifecycle-" + parentChanId,
    filter: {
      kinds: [
        KIND_HUDDLE_STARTED,
        KIND_HUDDLE_PARTICIPANT_JOINED,
        KIND_HUDDLE_PARTICIPANT_LEFT,
        KIND_HUDDLE_ENDED,
      ],
      "#h": [parentChanId],
      limit: 100,
    },
    onEvent: (raw) => {
      const ev = raw as LifecycleEvent;
      if (!store.some((e) => e.id === ev.id)) {
        store.push(ev);
        onUpdate([...store]);
      }
    },
  });
}
