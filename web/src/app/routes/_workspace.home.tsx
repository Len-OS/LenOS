import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/features/home/ui/HomePage";

export const Route = createFileRoute("/_workspace/home")({
  component: HomePage,
});
