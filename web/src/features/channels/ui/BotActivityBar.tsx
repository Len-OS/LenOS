import { useState, useEffect } from "react";
import { Bot } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/shared/ui/popover";
import { Avatar } from "@/shared/ui/Avatar";
import { useProfile } from "@/features/profiles/use-profile";
import { truncatePubkey } from "@/shared/lib/pubkey";
import { useChannelAgents } from "@/features/channels/useChannelAgents";

interface AgentRowProps {
  pubkey: string;
  activity: string;
  onView: () => void;
}

function AgentRow({ pubkey, activity, onView }: AgentRowProps) {
  const profile = useProfile(pubkey);
  const name = profile?.name || truncatePubkey(pubkey);
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Avatar src={profile?.picture} name={name} size={24} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-black dark:text-white">
          {name}
        </p>
        <p className="truncate text-[11px] text-black/50 dark:text-white/50">
          {activity || "Active"}
        </p>
      </div>
      <button
        type="button"
        onClick={onView}
        className="shrink-0 rounded px-2 py-0.5 text-[11px] text-black/50 hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white"
      >
        View
      </button>
    </div>
  );
}

function AgentAvatarMini({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  const name = profile?.name || truncatePubkey(pubkey);
  return (
    <div className="h-5 w-5 rounded-full border border-white dark:border-[#1a1a1a]">
      <Avatar src={profile?.picture} name={name} size={20} />
    </div>
  );
}

interface Props {
  channelId: string;
  onOpenAgentTranscript: (agentPubkey: string) => void;
}

export function BotActivityBar({ channelId, onOpenAgentTranscript }: Props) {
  const agents = useChannelAgents(channelId);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [headlineIndex, setHeadlineIndex] = useState(0);

  useEffect(() => {
    if (agents.length === 0) return;
    const id = setInterval(() => {
      setHeadlineIndex((i) => (i + 1) % agents.length);
    }, 3000);
    return () => clearInterval(id);
  }, [agents.length]);

  if (agents.length === 0) return null;

  const visible = agents.slice(0, 3);
  const overflow = agents.length - 3;
  const headline = agents[headlineIndex % agents.length];

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger
        onClick={() => setPopoverOpen((v) => !v)}
        aria-label="Active agents"
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-black/60 hover:bg-black/5 hover:text-black dark:text-white/60 dark:hover:bg-white/5 dark:hover:text-white"
      >
        <div className="flex -space-x-1.5">
          {visible.map((a) => (
            <AgentAvatarMini key={a.pubkey} pubkey={a.pubkey} />
          ))}
          {overflow > 0 && (
            <div className="flex h-5 w-5 items-center justify-center rounded-full border border-white bg-black/10 text-[10px] font-semibold text-black/60 dark:border-[#1a1a1a] dark:bg-white/10 dark:text-white/60">
              +{overflow}
            </div>
          )}
        </div>
        <span className="max-w-[160px] truncate text-xs">
          {headline?.latestActivityContent
            ? headline.latestActivityContent.slice(0, 40)
            : "Active"}
        </span>
        <Bot className="h-3.5 w-3.5 shrink-0 opacity-50" />
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 p-3">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-black/40 dark:text-white/40">
          Active Agents ({agents.length})
        </p>
        <div className="divide-y divide-black/5 dark:divide-white/5">
          {agents.map((agent) => (
            <AgentRow
              key={agent.pubkey}
              pubkey={agent.pubkey}
              activity={agent.latestActivityContent}
              onView={() => {
                onOpenAgentTranscript(agent.pubkey);
                setPopoverOpen(false);
              }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
