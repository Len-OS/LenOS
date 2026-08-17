import { useEffect, useState } from "react";
import { X, Hash, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { InboxItem } from "../useHomeInbox";
import type { Channel } from "@/features/channels/use-channels";
import { useProfile } from "@/features/profiles/use-profile";
import { Avatar } from "@/shared/ui/Avatar";
import { truncatePubkey } from "@/shared/lib/pubkey";
import { useProfilePanel } from "@/features/profiles/profile-panel-context";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import {
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
} from "@/shared/constants/kinds";

interface ContextMessage {
  id: string;
  pubkey: string;
  content: string;
  createdAt: number;
}

function useThreadContext(
  channelId: string,
  aroundTimestamp: number,
): ContextMessage[] {
  const [messages, setMessages] = useState<ContextMessage[]>([]);

  useEffect(() => {
    if (!channelId) return;
    const client = getRelayClient(relayWsUrl());
    const since = aroundTimestamp - 300;
    const until = aroundTimestamp + 60;
    const collected: ContextMessage[] = [];

    const unsub = client.subscribe({
      id: `inbox-ctx-${channelId}-${aroundTimestamp}`,
      filter: {
        kinds: [KIND_STREAM_MESSAGE, KIND_STREAM_MESSAGE_V2],
        "#h": [channelId],
        since,
        until,
        limit: 20,
      },
      onEvent: (raw) => {
        collected.push({
          id: raw.id as string,
          pubkey: raw.pubkey as string,
          content: raw.content as string,
          createdAt: raw.created_at as number,
        });
        setMessages([...collected].sort((a, b) => a.createdAt - b.createdAt));
      },
    });

    return unsub;
  }, [channelId, aroundTimestamp]);

  return messages;
}

function ContextMessageRow({
  msg,
  highlight,
}: {
  msg: ContextMessage;
  highlight: boolean;
}) {
  const profile = useProfile(msg.pubkey);
  const name = profile?.name || truncatePubkey(msg.pubkey);
  const { openProfile } = useProfilePanel();

  return (
    <div
      className={[
        "flex gap-2.5 px-4 py-2",
        highlight ? "bg-blue-50/80 dark:bg-blue-900/15" : "",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => openProfile(msg.pubkey)}
        className="mt-0.5 shrink-0"
      >
        <Avatar src={profile?.picture} name={name} size={28} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <button
            type="button"
            onClick={() => openProfile(msg.pubkey)}
            className="text-sm font-medium text-black hover:underline dark:text-white"
          >
            {name}
          </button>
          <span className="text-[11px] text-black/30 dark:text-white/30">
            {new Date(msg.createdAt * 1000).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap text-sm text-black/80 dark:text-white/80">
          {msg.content}
        </p>
      </div>
    </div>
  );
}

interface Props {
  item: InboxItem;
  channels: Channel[];
  onClose: () => void;
}

export function InboxDetailPane({ item, channels, onClose }: Props) {
  const channel = channels.find((c) => c.id === item.channelId);
  const contextMessages = useThreadContext(item.channelId, item.createdAt);

  return (
    <div className="flex h-full flex-col border-l border-black/10 dark:border-white/10">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/10 px-4 dark:border-white/10">
        <div className="flex items-center gap-2">
          {channel && (
            <>
              <Hash className="h-3.5 w-3.5 text-black/40 dark:text-white/40" />
              <span className="text-sm font-medium text-black dark:text-white">
                {channel.name}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {item.channelId && (
            <Link
              to="/channels/$channelId"
              params={{ channelId: item.channelId }}
              className="rounded-md p-1.5 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
              title="Open in channel"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {contextMessages.length === 0 ? (
          <ContextMessageRow
            msg={{
              id: item.messageId,
              pubkey: item.from,
              content: item.content,
              createdAt: item.createdAt,
            }}
            highlight
          />
        ) : (
          contextMessages.map((msg) => (
            <ContextMessageRow
              key={msg.id}
              msg={msg}
              highlight={msg.id === item.messageId}
            />
          ))
        )}
      </div>
    </div>
  );
}
