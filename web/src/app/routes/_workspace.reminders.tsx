import { createFileRoute } from "@tanstack/react-router";
import { RemindersPage } from "@/features/reminders/ui/RemindersPage";

export const Route = createFileRoute("/_workspace/reminders")({
  component: RemindersPage,
});
