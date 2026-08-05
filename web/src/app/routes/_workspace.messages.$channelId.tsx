import { createFileRoute } from "@tanstack/react-router";
import { ChannelView } from "@/features/channels/ui/ChannelView";

export const Route = createFileRoute("/_workspace/messages/$channelId")({
  component: ChannelView,
});
