import { Button } from "@/shared/ui/button";
import { usePollData } from "../hooks/usePollData";
import { usePollVotes } from "../hooks/usePollVotes";
import { signRelayEvent } from "@/shared/api/tauri";
import { relayClient } from "@/shared/api/relayClient";

interface Props {
  pollId: string;
  channelMessageEventId: string;
}

export function PollMessage({ pollId, channelMessageEventId }: Props) {
  const data = usePollData(pollId);
  const votes = usePollVotes(channelMessageEventId);

  if (!data) {
    return <p className="text-xs text-muted-foreground">Loading poll…</p>;
  }

  const totalVotes = Array.from(votes.values()).reduce(
    (sum, s) => sum + s.size,
    0,
  );

  const handleVote = async (optionIdx: number) => {
    try {
      const event = await signRelayEvent({
        kind: 7,
        content: String(optionIdx),
        tags: [["e", channelMessageEventId]],
      });
      await relayClient.publishEvent(
        event,
        "Timed out publishing vote.",
        "Failed to publish vote.",
      );
    } catch {
      // relay error or signer unavailable — silently ignore
    }
  };

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 max-w-sm">
      <p className="text-sm font-medium">{data.question}</p>
      <div className="space-y-1.5">
        {data.options.map((opt, i) => {
          const count = votes.get(String(i))?.size ?? 0;
          const pct =
            totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          return (
            <Button
              // biome-ignore lint/suspicious/noArrayIndexKey: poll options are positionally stable
              key={i}
              variant="outline"
              size="sm"
              className="w-full justify-start relative overflow-hidden"
              onClick={() => void handleVote(i)}
            >
              <div
                className="absolute inset-y-0 left-0 bg-primary/10"
                style={{ width: `${pct}%` }}
              />
              <span className="relative">{opt}</span>
              {count > 0 && (
                <span className="relative ml-auto text-xs text-muted-foreground">
                  {pct}%
                </span>
              )}
            </Button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
