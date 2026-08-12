import { createFileRoute } from "@tanstack/react-router";
import { HuddleBarPip } from "@/features/huddle/components/HuddleBarPip";

export const Route = createFileRoute("/huddle-pip")({
  component: HuddleBarPip,
});
