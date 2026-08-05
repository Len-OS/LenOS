import { createFileRoute } from "@tanstack/react-router";
import { AgentsPage } from "@/features/agents/ui/AgentsPage";

export const Route = createFileRoute("/_workspace/agents")({
  component: AgentsPage,
});
