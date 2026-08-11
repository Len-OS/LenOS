import { useState } from "react";
import { nip19 } from "nostr-tools";
import {
  Copy,
  Check,
  MessageSquare,
  Settings,
  ExternalLink,
} from "lucide-react";
import { useProfile } from "@/features/profiles/use-profile";
import { useUserStatus } from "@/features/profile/useUserStatus";
import { Avatar } from "@/shared/ui/Avatar";

interface Props {
  pubkey: string;
  open: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
  onSendDm?: (pubkey: string) => void;
  onViewProfile?: (pubkey: string) => void;
}

export function ProfilePopover({
  pubkey,
  open,
  onClose,
  onOpenSettings,
  onSendDm,
  onViewProfile,
}: Props) {
  const profile = useProfile(pubkey);
  const status = useUserStatus(pubkey);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const displayName = profile?.name || pubkey.slice(0, 8);
  const npub = (() => {
    try {
      return nip19.npubEncode(pubkey);
    } catch {
      return pubkey;
    }
  })();

  const copyPubkey = () => {
    void navigator.clipboard.writeText(npub);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="w-64 rounded-lg border border-black/10 bg-white p-4 shadow-xl dark:border-white/10 dark:bg-[#1e1e1e]">
      <div className="flex items-start gap-3">
        <Avatar src={profile?.picture} name={displayName} size={44} online />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-black dark:text-white">
            {displayName}
          </p>
          {status && (
            <p className="mt-0.5 truncate text-xs text-black/60 dark:text-white/60">
              {status.emoji} {status.text}
            </p>
          )}
          <button
            type="button"
            onClick={copyPubkey}
            className="mt-1 flex items-center gap-1 text-[11px] text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
          >
            {copied ? (
              <Check className="h-2.5 w-2.5" />
            ) : (
              <Copy className="h-2.5 w-2.5" />
            )}
            {copied ? "Copied" : `${npub.slice(0, 10)}…`}
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-0.5">
        {onViewProfile && (
          <button
            type="button"
            onClick={() => {
              onViewProfile(pubkey);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View profile
          </button>
        )}
        {onSendDm && (
          <button
            type="button"
            onClick={() => {
              onSendDm(pubkey);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Send message
          </button>
        )}
        {onOpenSettings && (
          <button
            type="button"
            onClick={() => {
              onOpenSettings();
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
          >
            <Settings className="h-3.5 w-3.5" />
            Settings
          </button>
        )}
      </div>
    </div>
  );
}
