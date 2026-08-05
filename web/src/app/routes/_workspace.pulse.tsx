import { createFileRoute } from "@tanstack/react-router";
import { PulsePage } from "@/features/pulse/ui/PulsePage";

export const Route = createFileRoute("/_workspace/pulse")({
  component: PulsePage,
});
