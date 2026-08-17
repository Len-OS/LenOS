import * as React from "react";
import { MessageSquare, Users } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { useRelayMembersQuery } from "@/features/community-members/hooks";
import { useUsersBatchQuery } from "@/features/profile/hooks";
import { ProfileAvatar } from "@/features/profile/ui/ProfileAvatar";
import { UserProfilePopover } from "@/features/profile/ui/UserProfilePopover";
import type { RelayMember, UserProfileSummary } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { truncatePubkey } from "@/shared/lib/pubkey";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

function formatMemberName(
  member: RelayMember,
  profile: UserProfileSummary | undefined,
): string {
  const name = profile?.displayName?.trim() ?? profile?.name?.trim() ?? "";
  if (name && !name.toLowerCase().startsWith("npub1")) return name;
  return truncatePubkey(member.pubkey);
}

interface MemberCardProps {
  member: RelayMember;
  profile: UserProfileSummary | undefined;
  onMessage: (pubkey: string) => void;
}

function MemberCard({ member, profile, onMessage }: MemberCardProps) {
  const displayName = formatMemberName(member, profile);

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border/60 bg-card p-4 text-center transition-colors hover:bg-muted/30">
      <UserProfilePopover pubkey={member.pubkey} triggerElement="span">
        <span className="cursor-pointer">
          <ProfileAvatar
            avatarUrl={profile?.avatarUrl ?? null}
            label={displayName}
            className="h-12 w-12 text-sm"
          />
        </span>
      </UserProfilePopover>

      <div className="w-full min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {displayName}
        </p>
        <span
          className={cn(
            "mt-0.5 inline-block rounded px-1.5 py-0.5 text-badge font-semibold uppercase tracking-wide",
            member.role === "admin" || member.role === "owner"
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
              : "bg-muted text-muted-foreground",
          )}
        >
          {member.role}
        </span>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => onMessage(member.pubkey)}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Message
      </Button>
    </div>
  );
}

export function PeoplePage() {
  const navigate = useNavigate();
  const [search, setSearch] = React.useState("");

  const { data: membersData } = useRelayMembersQuery();
  const members = membersData ?? [];

  const pubkeys = React.useMemo(() => members.map((m) => m.pubkey), [members]);

  const { data: profilesData } = useUsersBatchQuery(pubkeys);
  const profiles = profilesData?.profiles ?? {};

  const lowerSearch = search.trim().toLowerCase();
  const filtered = lowerSearch
    ? members.filter((m) => {
        const profile = profiles[m.pubkey.toLowerCase()];
        const name = formatMemberName(m, profile).toLowerCase();
        return name.includes(lowerSearch);
      })
    : members;

  const handleMessage = React.useCallback(
    (_pubkey: string) => {
      void navigate({ to: "/messages/new" });
    },
    [navigate],
  );

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="flex items-center gap-3 px-6 py-4">
          <Users className="h-5 w-5 shrink-0 text-muted-foreground" />
          <h1 className="text-lg font-semibold">People</h1>
          {members.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {members.length}
            </span>
          )}
        </div>
        <div className="px-6 pb-3">
          <Input
            type="search"
            placeholder="Search members…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 max-w-sm"
          />
        </div>
      </div>

      <div className="p-6">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {lowerSearch ? "No members match your search." : "No members yet."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filtered.map((member) => (
              <MemberCard
                key={member.pubkey}
                member={member}
                profile={profiles[member.pubkey.toLowerCase()]}
                onMessage={handleMessage}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
