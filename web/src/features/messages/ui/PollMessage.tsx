import { usePollData } from "../hooks/usePollData";
import { usePollVotes } from "../hooks/usePollVotes";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

interface Props {
  pollId: string;
  channelMessageEventId: string; // the kind:40002 event's id
}

export function PollMessage({ pollId, channelMessageEventId }: Props) {
  const data = usePollData(pollId);
  const votes = usePollVotes(channelMessageEventId);

  if (!data) {
    return (
      <div className="text-xs text-black/50 dark:text-white/50">
        Loading poll…
      </div>
    );
  }

  const totalVotes = Array.from(votes.values()).reduce(
    (sum, s) => sum + s.size,
    0,
  );

  const handleVote = async (optionIdx: number) => {
    try {
      const signed = await signNostrEvent(
        {
          kind: 7,
          content: String(optionIdx),
          tags: [["e", channelMessageEventId]],
        },
        { requireDurableSigner: true },
      );
      await getRelayClient(relayWsUrl()).publishAndWait(
        signed as Record<string, unknown>,
      );
    } catch {
      // no NIP-07 or relay error — silently ignore
    }
  };

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 p-3 space-y-2 max-w-sm">
      <p className="text-sm font-medium">{data.question}</p>
      <div className="space-y-1.5">
        {data.options.map((opt, i) => {
          const count = votes.get(String(i))?.size ?? 0;
          const pct =
            totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          return (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: poll options are positionally stable
              key={i}
              type="button"
              onClick={() => void handleVote(i)}
              className="w-full text-left rounded border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5 relative overflow-hidden transition-colors"
            >
              <div
                className="absolute inset-y-0 left-0 bg-blue-500/10 dark:bg-blue-400/10"
                style={{ width: `${pct}%` }}
              />
              <span className="relative">{opt}</span>
              {count > 0 && (
                <span className="relative float-right text-xs text-black/50 dark:text-white/50">
                  {pct}%
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-black/50 dark:text-white/50">
        {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
