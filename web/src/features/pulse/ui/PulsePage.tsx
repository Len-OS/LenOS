import { Activity } from "lucide-react";
import { useCommunityId } from "@/shared/lib/workspace-context";
import { useChannels } from "@/features/channels/use-channels";
import { usePulseFeed } from "../usePulseFeed";
import { ActivityCard } from "./ActivityCard";

export function PulsePage() {
  const communityId = useCommunityId();
  const channels = useChannels(communityId);
  const items = usePulseFeed(communityId);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center border-b border-black/10 px-4 dark:border-white/10">
        <Activity className="mr-2 h-4 w-4 text-black/40 dark:text-white/40" />
        <span className="font-semibold text-black dark:text-white">Pulse</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Activity className="h-10 w-10 text-black/20 dark:text-white/20" />
            <div>
              <p className="text-sm font-medium text-black/50 dark:text-white/50">
                No recent activity
              </p>
              <p className="mt-1 text-xs text-black/30 dark:text-white/30">
                Activity from the last 7 days will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <ActivityCard key={item.id} item={item} channels={channels} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
