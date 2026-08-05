import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import type { Reaction } from "@/features/messages/use-reactions";

interface Props {
  messageId: string;
  channelId: string;
  reactions: Reaction[];
  currentPubkey: string | null;
}

export function MessageReactions({
  messageId,
  channelId,
  reactions,
  currentPubkey,
}: Props) {
  const grouped = reactions.reduce<Record<string, Reaction[]>>((acc, r) => {
    if (r.targetId !== messageId) return acc;
    if (!acc[r.content]) acc[r.content] = [];
    acc[r.content].push(r);
    return acc;
  }, {});

  const addReaction = async (emoji: string) => {
    try {
      const signed = await signNostrEvent(
        {
          kind: 7,
          content: emoji,
          tags: [
            ["e", messageId],
            ["h", channelId],
          ],
        },
        { requireNip07: true },
      );
      getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
    } catch {
      // no NIP-07
    }
  };

  if (Object.keys(grouped).length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {Object.entries(grouped).map(([emoji, rs]) => {
        const reacted = currentPubkey
          ? rs.some((r) => r.pubkey === currentPubkey)
          : false;
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => void addReaction(emoji)}
            className={[
              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
              reacted
                ? "border-blue-400/50 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                : "border-black/10 hover:border-black/20 dark:border-white/10 dark:hover:border-white/20",
            ].join(" ")}
          >
            <span>{emoji}</span>
            <span className="text-black/50 dark:text-white/50">{rs.length}</span>
          </button>
        );
      })}
    </div>
  );
}
