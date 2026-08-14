import type { SlashCommand } from "@/shared/lib/slashCommandRegistry";

interface Props {
  commands: SlashCommand[];
  selectedIdx: number;
  onSelect: (cmd: SlashCommand) => void;
}

export function SlashCommandPalette({
  commands,
  selectedIdx,
  onSelect,
}: Props) {
  if (commands.length === 0) return null;
  return (
    <div className="mb-1 overflow-hidden rounded-md border border-black/10 bg-white shadow-lg dark:border-white/10 dark:bg-[#1e1e1e]">
      {commands.map((cmd, i) => (
        <button
          key={cmd.name}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(cmd);
          }}
          className={[
            "flex w-full items-center gap-3 px-3 py-1.5 text-sm text-black/80 dark:text-white/80",
            i === selectedIdx
              ? "bg-black/5 dark:bg-white/5"
              : "hover:bg-black/5 dark:hover:bg-white/5",
          ].join(" ")}
        >
          <span className="font-mono font-medium text-black dark:text-white">
            /{cmd.name}
          </span>
          <span className="text-black/50 dark:text-white/50">
            {cmd.description}
          </span>
          <span className="ml-auto text-xs text-black/30 dark:text-white/30">
            {cmd.usage}
          </span>
        </button>
      ))}
    </div>
  );
}
