import { useCommunityId } from "@/shared/lib/workspace-context";
import { usePresence } from "@/features/presence/usePresence";

type PresenceSize = "xs" | "sm" | "md";

interface Props {
  pubkey: string;
  size?: PresenceSize;
  showLabel?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<PresenceSize, string> = {
  xs: "w-2 h-2",
  sm: "w-2.5 h-2.5",
  md: "w-3 h-3",
};

export function PresenceBadge({
  pubkey,
  size = "sm",
  showLabel = false,
  className,
}: Props) {
  const communityId = useCommunityId();
  const onlinePubkeys = usePresence([pubkey], communityId);
  const isOnline = onlinePubkeys.has(pubkey);

  const dotColor = isOnline ? "bg-green-500" : "bg-black/20 dark:bg-white/20";
  const label = isOnline ? "Online" : "Offline";

  return (
    <span
      className={`inline-flex items-center gap-1${className ? ` ${className}` : ""}`}
    >
      <span
        aria-label={label}
        role="img"
        className={`rounded-full flex-shrink-0 ${SIZE_CLASSES[size]} ${dotColor}`}
      />
      {showLabel && (
        <span className="text-xs text-black/40 dark:text-white/40">{label}</span>
      )}
    </span>
  );
}
