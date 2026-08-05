import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getCurrentPubkey } from "@/shared/lib/nostr-signer";
import { useCommunityId } from "@/shared/lib/workspace-context";
import { DmList } from "@/features/messages/ui/DmList";

function MessagesIndex() {
  const communityId = useCommunityId();
  const [currentPubkey, setCurrentPubkey] = useState<string | null>(null);

  useEffect(() => {
    getCurrentPubkey()
      .then(setCurrentPubkey)
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center border-b border-black/10 px-4 dark:border-white/10">
        <span className="font-semibold text-black dark:text-white">
          Direct Messages
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <DmList currentPubkey={currentPubkey} communityId={communityId} />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_workspace/messages")({
  component: MessagesIndex,
});
