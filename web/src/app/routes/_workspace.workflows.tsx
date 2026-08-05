import { createFileRoute } from "@tanstack/react-router";
import { WorkflowsPage } from "@/features/workflows/ui/WorkflowsPage";

export const Route = createFileRoute("/_workspace/workflows")({
  component: WorkflowsPage,
});
