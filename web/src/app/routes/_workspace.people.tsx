import { createFileRoute } from "@tanstack/react-router";
import { PeoplePage } from "@/features/people/ui/PeoplePage";

export const Route = createFileRoute("/_workspace/people")({
  component: PeoplePage,
});
