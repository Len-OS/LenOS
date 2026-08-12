const SHORTCUTS = [
  { keys: ["Ctrl", "K"], action: "Quick search" },
  { keys: ["Ctrl", "N"], action: "New message" },
  { keys: ["Ctrl", ","], action: "Open settings" },
  { keys: ["Ctrl", "Shift", "M"], action: "Toggle mute" },
  { keys: ["Ctrl", "Shift", "D"], action: "Toggle dark mode" },
  { keys: ["Esc"], action: "Close modal / deselect" },
  { keys: ["↑", "↓"], action: "Navigate channels" },
] as const;

export function KeyboardShortcutsPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-black dark:text-white">
          Keyboard Shortcuts
        </h3>
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          Navigate faster with these shortcuts.
        </p>
      </div>

      <div className="space-y-1">
        {SHORTCUTS.map((s) => (
          <div
            key={s.action}
            className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
          >
            <span className="text-sm text-black/70 dark:text-white/70">
              {s.action}
            </span>
            <div className="flex gap-1">
              {s.keys.map((key) => (
                <kbd
                  key={key}
                  className="rounded border border-black/10 bg-black/5 px-1.5 py-0.5 font-mono text-[11px] text-black/60 dark:border-white/10 dark:bg-white/5 dark:text-white/60"
                >
                  {key}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
