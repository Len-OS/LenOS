import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useChannelMutations } from "@/features/channels/useChannelMutations";

type Visibility = "open" | "private" | "invite";

const OPTIONS: Array<{
  value: Visibility;
  label: string;
  description: string;
}> = [
  { value: "open", label: "Public", description: "Anyone can join and view" },
  {
    value: "private",
    label: "Private",
    description: "Members only, visible in list",
  },
  {
    value: "invite",
    label: "Invite-only",
    description: "Hidden, requires invite link",
  },
];

interface Props {
  channelId: string;
  visibility: string;
  isAdmin: boolean;
}

export function ChannelPermissions({ channelId, visibility, isAdmin }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { editChannelVisibility } = useChannelMutations();

  const current = (
    ["open", "private", "invite"].includes(visibility) ? visibility : "open"
  ) as Visibility;

  const handleChange = async (next: Visibility) => {
    if (!isAdmin || next === current || saving) return;
    setSaving(true);
    setError("");
    try {
      await editChannelVisibility(channelId, next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update.");
    }
    setSaving(false);
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <p className="text-sm font-medium text-black/70 dark:text-white/70">
          Visibility
        </p>
        {saving && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-black/40 dark:text-white/40" />
        )}
      </div>
      <div className="space-y-2">
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
              current === opt.value
                ? "border-black/30 bg-black/5 dark:border-white/30 dark:bg-white/5"
                : "border-black/10 hover:bg-black/[0.02] dark:border-white/10 dark:hover:bg-white/[0.02]"
            } ${!isAdmin ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <input
              type="radio"
              name="channel-visibility"
              value={opt.value}
              checked={current === opt.value}
              disabled={!isAdmin || saving}
              onChange={() => void handleChange(opt.value)}
              className="mt-0.5 accent-black dark:accent-white"
            />
            <div>
              <p className="text-sm font-medium text-black dark:text-white">
                {opt.label}
              </p>
              <p className="text-xs text-black/50 dark:text-white/50">
                {opt.description}
              </p>
            </div>
          </label>
        ))}
      </div>
      {!isAdmin && (
        <p className="mt-2 text-xs text-black/40 dark:text-white/40">
          Only admins can change channel visibility.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
