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
import { useSetUserStatus, useUserStatus } from "@/features/profile/useUserStatus";
import { Avatar } from "@/shared/ui/Avatar";

interface Props {
  pubkey: string;
  open: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
  onSendDm?: (pubkey: string) => void;
  onViewProfile?: (pubkey: string) => void;
  online?: boolean;
}

export function ProfilePopover({
  pubkey,
  open,
  onClose,
  onOpenSettings,
  onSendDm,
  onViewProfile,
  online,
}: Props) {
  const profile = useProfile(pubkey);
  const status = useUserStatus(pubkey);
  const setUserStatus = useSetUserStatus();
  const [copied, setCopied] = useState(false);
  const [customText, setCustomText] = useState("");

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
        <Avatar
          src={profile?.picture}
          name={displayName}
          size={44}
          online={online}
        />
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

      {onOpenSettings && (
        <div className="mt-2 space-y-2 border-t border-black/10 pt-2 dark:border-white/10">
          <p className="text-xs font-medium text-black/50 dark:text-white/50">
            Status
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { status: "online", emoji: "🟢", label: "Online" },
                { status: "away", emoji: "🌙", label: "Away" },
                { status: "dnd", emoji: "⛔", label: "DND" },
                { status: "offline", emoji: "⭕", label: "Offline" },
              ] as const
            ).map(({ status: s, emoji, label }) => (
              <button
                key={s}
                type="button"
                onClick={() => void setUserStatus(s, customText || undefined)}
                className="flex items-center gap-1 rounded-full border border-black/10 px-2 py-0.5 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
              >
                <span>{emoji}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
          <input
            className="w-full rounded border border-black/10 bg-transparent px-2 py-1 text-xs placeholder:text-black/40 dark:border-white/10 dark:placeholder:text-white/40"
            placeholder="Add a status message…"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
