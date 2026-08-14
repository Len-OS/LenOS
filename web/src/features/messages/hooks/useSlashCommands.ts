import { useState, useMemo } from "react";
import { SLASH_COMMANDS, type SlashCommand } from "@/shared/lib/slashCommandRegistry";

interface SlashCommandState {
  active: boolean;
  query: string;
  filtered: SlashCommand[];
  selectedIdx: number;
}

export type { SlashCommandState };

export function useSlashCommands(text: string, _cursorPos: number) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  const match = text.match(/^\/(\S*)$/);
  const active = match !== null;
  const query = match?.[1] ?? "";

  const filtered = useMemo(
    () =>
      active
        ? SLASH_COMMANDS.filter(
            (c) => query === "" || c.name.toLowerCase().startsWith(query.toLowerCase()),
          )
        : [],
    [active, query],
  );

  return {
    active,
    query,
    filtered,
    selectedIdx: Math.min(selectedIdx, Math.max(0, filtered.length - 1)),
    select: (idx: number) => {
      setSelectedIdx(0);
      return filtered[idx] ?? null;
    },
    moveUp: () => setSelectedIdx((i) => Math.max(0, i - 1)),
    moveDown: () => setSelectedIdx((i) => Math.min(filtered.length - 1, i + 1)),
    dismiss: () => setSelectedIdx(0),
  };
}
