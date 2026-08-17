import { useCallback, useEffect, useRef, useState } from "react";
import { Users } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useMembers } from "@/features/channels/useMembers";
import { useProfile } from "@/features/profiles/use-profile";
import { ProfilePopover } from "@/features/profiles/ui/ProfilePopover";
import { Avatar } from "@/shared/ui/Avatar";
import { useCommunityId } from "@/shared/lib/workspace-context";
import type { Member } from "@/features/channels/useMembers";

function truncatePubkey(pk: string): string {
  return `${pk.slice(0, 8)}…${pk.slice(-4)}`;
}

interface MemberCardItemProps {
  member: Member;
  popoverOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSendDm: (pubkey: string) => void;
  onNameResolved: (pubkey: string, name: string) => void;
}

function MemberCardItem({
  member,
  popoverOpen,
  onOpen,
  onClose,
  onSendDm,
  onNameResolved,
}: MemberCardItemProps) {
  const profile = useProfile(member.pubkey);
  const displayName = profile?.name || truncatePubkey(member.pubkey);
  const onNameResolvedRef = useRef(onNameResolved);
  onNameResolvedRef.current = onNameResolved;

  useEffect(() => {
    if (profile?.name) {
      onNameResolvedRef.current(member.pubkey, profile.name);
    }
  }, [profile?.name, member.pubkey]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (popoverOpen) {
            onClose();
          } else {
            onOpen();
          }
        }}
        className="flex w-full flex-col items-center gap-2 rounded-xl border border-black/10 bg-white p-4 text-center transition-colors hover:bg-black/5 dark:border-white/10 dark:bg-[#1e1e1e] dark:hover:bg-white/5"
      >
        <Avatar src={profile?.picture} name={displayName} size={48} />
        <div className="w-full min-w-0">
          <p className="truncate text-sm font-medium text-black dark:text-white">
            {displayName}
          </p>
          <span
            className={[
              "mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              member.role === "admin"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                : "bg-black/5 text-black/50 dark:bg-white/5 dark:text-white/50",
            ].join(" ")}
          >
            {member.role === "admin" ? "admin" : "member"}
          </span>
        </div>
      </button>

      {popoverOpen && (
        <div className="absolute left-0 top-full z-30 mt-1">
          <ProfilePopover
            pubkey={member.pubkey}
            open
            onClose={onClose}
            onSendDm={onSendDm}
          />
        </div>
      )}
    </div>
  );
}

export function PeoplePage() {
  const communityId = useCommunityId();
  const members = useMembers(communityId);
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const [resolvedNames, setResolvedNames] = useState<Map<string, string>>(
    new Map(),
  );

  const handleNameResolved = useCallback((pubkey: string, name: string) => {
    setResolvedNames((prev) => {
      if (prev.get(pubkey) === name) return prev;
      const next = new Map(prev);
      next.set(pubkey, name);
      return next;
    });
  }, []);

  const handleSendDm = useCallback(
    (_pubkey: string) => {
      setOpenPopoverId(null);
      void navigate({ to: "/messages/new" });
    },
    [navigate],
  );

  const lowerSearch = search.trim().toLowerCase();
  const filtered = lowerSearch
    ? members.filter((m) => {
        const name =
          resolvedNames.get(m.pubkey)?.toLowerCase() ??
          m.pubkey.slice(0, 8).toLowerCase();
        return name.includes(lowerSearch);
      })
    : members;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: transparent click-outside dismissal wrapper
    <div
      className="flex flex-1 flex-col overflow-y-auto"
      onClick={() => setOpenPopoverId(null)}
      role="presentation"
    >
      <div className="sticky top-0 z-10 border-b border-black/10 bg-white/90 backdrop-blur dark:border-white/10 dark:bg-[#111]/90">
        <div className="flex items-center gap-3 px-6 py-4">
          <Users className="h-5 w-5 shrink-0 text-black/60 dark:text-white/60" />
          <h1 className="text-lg font-semibold text-black dark:text-white">
            People
          </h1>
          {members.length > 0 && (
            <span className="text-sm text-black/40 dark:text-white/40">
              {members.length}
            </span>
          )}
        </div>
        <div className="px-6 pb-3">
          <input
            type="search"
            placeholder="Search members…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOpenPopoverId(null);
            }}
            className="h-8 w-full max-w-sm rounded-lg border border-black/15 bg-black/5 px-3 text-sm outline-none placeholder:text-black/30 focus:border-black/30 dark:border-white/15 dark:bg-white/5 dark:placeholder:text-white/30 dark:focus:border-white/30"
          />
        </div>
      </div>

      <div className="p-6">
        {filtered.length === 0 ? (
          <p className="text-sm text-black/30 dark:text-white/30">
            {lowerSearch ? "No members match your search." : "No members yet."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filtered.map((member) => (
              <MemberCardItem
                key={member.pubkey}
                member={member}
                popoverOpen={openPopoverId === member.pubkey}
                onOpen={() => setOpenPopoverId(member.pubkey)}
                onClose={() => setOpenPopoverId(null)}
                onSendDm={handleSendDm}
                onNameResolved={handleNameResolved}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
