import { Hash } from "lucide-react";
import { useChannels } from "@/features/channels/use-channels";
import { useCommunityId, useWorkspace } from "@/shared/lib/workspace-context";

interface Props {
  activeChannelId: string | null;
  onSelectChannel: (id: string) => void;
}

export function ChannelsSidebar({ activeChannelId, onSelectChannel }: Props) {
  const communityId = useCommunityId();
  const channels = useChannels(communityId);
  const workspace = useWorkspace();

  const workspaceName =
    workspace.status === "found" ? workspace.workspace.slug : "Workspace";

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center border-b border-black/10 px-4 dark:border-white/10">
        <span className="truncate font-semibold text-black dark:text-white">
          {workspaceName}
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        <div className="mb-1 px-4 text-xs font-semibold uppercase tracking-wider text-black/40 dark:text-white/40">
          Channels
        </div>

        {channels.length === 0 && (
          <div className="px-4 py-2 text-sm text-black/40 dark:text-white/40">
            No channels yet
          </div>
        )}

        {channels.map((ch) => (
          <button
            key={ch.id}
            type="button"
            onClick={() => onSelectChannel(ch.id)}
            className={[
              "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
              activeChannelId === ch.id
                ? "bg-black/10 font-medium text-black dark:bg-white/15 dark:text-white"
                : "text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5",
            ].join(" ")}
          >
            <Hash className="h-3.5 w-3.5 shrink-0 opacity-50" />
            <span className="truncate">{ch.name}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
