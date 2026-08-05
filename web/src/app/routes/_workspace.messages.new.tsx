import { createFileRoute } from "@tanstack/react-router";
import { NewMessageScreen } from "@/features/messages/ui/NewMessageScreen";

export const Route = createFileRoute("/_workspace/messages/new")({
  component: NewMessageScreen,
});
