import type { SlashCommand } from "@/shared/lib/slashCommandRegistry";

interface Props {
  commands: SlashCommand[];
  selectedIdx: number;
  onSelect: (cmd: SlashCommand) => void;
}

export function SlashCommandPalette({ commands, selectedIdx, onSelect }: Props) {
  if (commands.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-popover shadow-md overflow-hidden">
      {commands.map((cmd, i) => (
        <button
          key={cmd.name}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(cmd);
          }}
          className={[
            "w-full text-left px-3 py-2 text-sm flex items-center gap-3 transition-colors",
            i === selectedIdx ? "bg-accent" : "hover:bg-accent",
          ].join(" ")}
        >
          <span className="font-mono font-medium text-primary">/{cmd.name}</span>
          <span className="text-xs text-muted-foreground">{cmd.description}</span>
          <span className="ml-auto text-xs text-muted-foreground/60">{cmd.usage}</span>
        </button>
      ))}
    </div>
  );
}
