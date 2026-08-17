import { ExternalLink, Settings } from "lucide-react";
import { Avatar } from "@/shared/ui/Avatar";
import { StatusPicker } from "@/features/profile/ui/StatusPicker";
import { useProfile } from "@/features/profiles/use-profile";
import { useUserStatus } from "@/features/profile/useUserStatus";
import { truncatePubkey } from "@/shared/lib/pubkey";

interface Props {
  pubkey: string;
  statusPickerOpen: boolean;
  onToggleStatusPicker: () => void;
  onCloseStatusPicker: () => void;
  onOpenSettings: () => void;
  onOpenProfile: () => void;
  onEditAvatar?: () => void;
}

export function SidebarProfileCard({
  pubkey,
  statusPickerOpen,
  onToggleStatusPicker,
  onCloseStatusPicker,
  onOpenSettings,
  onOpenProfile,
  onEditAvatar,
}: Props) {
  const profile = useProfile(pubkey);
  const status = useUserStatus(pubkey);
  const displayName = profile?.name || truncatePubkey(pubkey);

  return (
    <div className="relative shrink-0 border-t border-black/10 px-3 py-2 dark:border-white/10">
      {statusPickerOpen && (
        <div className="absolute bottom-full left-3 z-30 mb-1">
          <StatusPicker currentPubkey={pubkey} onClose={onCloseStatusPicker} />
        </div>
      )}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onEditAvatar ?? onOpenProfile}
          aria-label="Edit avatar"
          className="shrink-0 rounded-md p-1 hover:bg-black/5 dark:hover:bg-white/5"
        >
          <Avatar src={profile?.picture} name={displayName} size={26} />
        </button>
        <button
          type="button"
          onClick={onToggleStatusPicker}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/5"
        >
          <span className="text-base leading-none">
            {status?.emoji ?? "😶"}
          </span>
          <span className="truncate text-xs text-black/60 dark:text-white/60">
            {status?.text || "Set a status"}
          </span>
        </button>
        <a
          href={
            import.meta.env.VITE_DASHBOARD_URL ??
            "https://dashboard.lengrowth.com"
          }
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Advanced Dashboard"
          title="Advanced Dashboard"
          className="rounded-md p-1.5 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Settings"
          className="rounded-md p-1.5 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
