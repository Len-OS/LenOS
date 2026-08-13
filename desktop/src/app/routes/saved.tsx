import { createFileRoute } from "@tanstack/react-router";
import { SavedMessagesPage } from "@/features/bookmarks/ui/SavedMessagesPage";

export const Route = createFileRoute("/saved")({
  component: SavedMessagesPage,
});
