import { createFileRoute } from "@tanstack/react-router";
import { ScheduledMessagesPanel } from "@/features/messages/ui/ScheduledMessagesPanel";

export const Route = createFileRoute("/_workspace/drafts/scheduled")({
  component: ScheduledMessagesPanel,
});
