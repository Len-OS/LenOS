import { useState, useRef, useEffect } from "react";
import { nip19 } from "nostr-tools";
import { useProfile } from "@/features/profiles/use-profile";
import { Avatar } from "@/shared/ui/Avatar";
import type { Member } from "@/features/channels/useMembers";

function truncatePubkey(pk: string): string {
  return `${pk.slice(0, 8)}…${pk.slice(-4)}`;
}

interface Props {
  member: Member;
}

export function MemberCard({ member }: Props) {
  const profile = useProfile(member.pubkey);
  const displayName = profile?.name || truncatePubkey(member.pubkey);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const copyPubkey = () => {
    try {
      const npub = nip19.npubEncode(member.pubkey);
      void navigator.clipboard.writeText(npub);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5"
      >
        <Avatar src={profile?.picture} name={displayName} size={28} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-black dark:text-white">
            {displayName}
          </p>
        </div>
        {member.role === "admin" && (
          <span className="shrink-0 rounded px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
            admin
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-lg border border-black/10 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-[#1e1e1e]">
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-sm text-black/80 hover:bg-black/5 dark:text-white/80 dark:hover:bg-white/5"
            onClick={() => setOpen(false)}
          >
            Send DM
          </button>
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-sm text-black/80 hover:bg-black/5 dark:text-white/80 dark:hover:bg-white/5"
            onClick={() => setOpen(false)}
          >
            View profile
          </button>
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-sm text-black/80 hover:bg-black/5 dark:text-white/80 dark:hover:bg-white/5"
            onClick={copyPubkey}
          >
            {copied ? "Copied!" : "Copy pubkey"}
          </button>
        </div>
      )}
    </div>
  );
}
