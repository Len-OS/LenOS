import type { Channel } from "@/features/channels/use-channels";

export interface SidebarSection {
  id: "starred" | "channels" | "muted";
  label: string;
  channels: Channel[];
  defaultCollapsed: boolean;
}

export function buildSidebarSections(
  channels: Channel[],
  mutedIds: Set<string>,
  starredIds: Set<string>,
  starredOrder: string[],
): SidebarSection[] {
  const starred: Channel[] = starredOrder
    .map((id) => channels.find((c) => c.id === id))
    .filter((c): c is Channel => c !== undefined);

  const regular = channels
    .filter((c) => !mutedIds.has(c.id) && !starredIds.has(c.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const muted = channels
    .filter((c) => mutedIds.has(c.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const sections: SidebarSection[] = [];

  if (starred.length > 0) {
    sections.push({
      id: "starred",
      label: "Starred",
      channels: starred,
      defaultCollapsed: false,
    });
  }

  sections.push({
    id: "channels",
    label: "Channels",
    channels: regular,
    defaultCollapsed: false,
  });

  if (muted.length > 0) {
    sections.push({
      id: "muted",
      label: "Muted",
      channels: muted,
      defaultCollapsed: true,
    });
  }

  return sections;
}
