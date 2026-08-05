import { useTheme } from "@/shared/theme/ThemeProvider";

type Theme = "light" | "dark" | "system";

const options: { value: Theme; label: string; desc: string }[] = [
  { value: "light", label: "Light", desc: "Always light interface" },
  { value: "dark", label: "Dark", desc: "Always dark interface" },
  { value: "system", label: "System", desc: "Follow OS preference" },
];

export function AppearanceSettingsPanel() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="max-w-md">
      <p className="mb-4 text-sm font-medium text-black/70 dark:text-white/70">
        Theme
      </p>
      <div className="space-y-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setTheme(o.value)}
            className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
              theme === o.value
                ? "border-black bg-black/5 dark:border-white dark:bg-white/10"
                : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            }`}
          >
            <div
              className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                theme === o.value
                  ? "border-black bg-black dark:border-white dark:bg-white"
                  : "border-black/30 dark:border-white/30"
              }`}
            />
            <div>
              <p className="text-sm font-medium text-black dark:text-white">
                {o.label}
              </p>
              <p className="text-xs text-black/40 dark:text-white/40">
                {o.desc}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
