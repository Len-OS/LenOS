import { createFileRoute } from "@tanstack/react-router";
import { DraftsPanel } from "@/features/messages/ui/DraftsPanel";

export const Route = createFileRoute("/_workspace/drafts/")({
  component: DraftsPanel,
});
