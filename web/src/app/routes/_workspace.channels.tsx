import { createFileRoute } from "@tanstack/react-router";

function ChannelsIndex() {
  return (
    <div className="flex flex-1 items-center justify-center text-sm text-black/40 dark:text-white/40">
      Select a channel to start messaging
    </div>
  );
}

export const Route = createFileRoute("/_workspace/channels")({
  component: ChannelsIndex,
});
