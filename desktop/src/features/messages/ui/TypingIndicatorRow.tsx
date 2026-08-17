import * as React from "react";

import {
  resolveUserLabel,
  type UserProfileLookup,
} from "@/features/profile/lib/identity";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import type { Channel } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { Shimmer } from "@/shared/ui/Shimmer";
import { truncatePubkey } from "@/shared/lib/pubkey";

type TypingIndicatorRowProps = {
  channel: Channel | null;
  className?: string;
  currentPubkey?: string;
  profiles?: UserProfileLookup;
  typingPubkeys: string[];
  variant?: "default" | "activity";
};

function resolveFallbackName(channel: Channel | null, pubkey: string) {
  if (channel?.channelType !== "dm") {
    return null;
  }

  const participantIndex = channel.participantPubkeys.findIndex(
    (candidate) => candidate.toLowerCase() === pubkey.toLowerCase(),
  );

  if (participantIndex < 0) {
    return null;
  }

  return channel.participants[participantIndex] ?? null;
}

function formatTypingLabel(names: string[]) {
  if (names.length === 1) {
    return `${names[0]} is typing...`;
  }

  if (names.length === 2) {
    return `${names[0]}, ${names[1]} are typing...`;
  }

  if (names.length === 3) {
    return `${names[0]}, ${names[1]}, ${names[2]} are typing...`;
  }

  return `${names[0]}, ${names[1]}, and ${names.length - 2} others are typing...`;
}

function TyperAvatar({
  pubkey,
  profile,
  label,
  isActivityVariant,
}: {
  pubkey: string;
  profile:
    | { avatarUrl?: string | null; displayName?: string | null }
    | undefined;
  label: string;
  isActivityVariant: boolean;
}) {
  const name = profile?.displayName ?? label ?? truncatePubkey(pubkey);
  return (
    <Avatar
      className={cn(
        "border border-background",
        isActivityVariant ? "w-4 h-4" : "w-5 h-5",
      )}
    >
      <AvatarImage src={profile?.avatarUrl ?? undefined} alt={name} />
      <AvatarFallback className="text-[9px]">
        {name?.[0]?.toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

export function TypingIndicatorRow({
  channel,
  className,
  currentPubkey,
  profiles,
  typingPubkeys,
  variant = "default",
}: TypingIndicatorRowProps) {
  const isActivityVariant = variant === "activity";
  const labels = React.useMemo(
    () =>
      typingPubkeys.map((pubkey) =>
        resolveUserLabel({
          pubkey,
          currentPubkey,
          fallbackName: resolveFallbackName(channel, pubkey),
          profiles,
          preferResolvedSelfLabel: true,
        }),
      ),
    [channel, currentPubkey, profiles, typingPubkeys],
  );

  // Show max 3 names in both avatars and text
  const maxVisible = 3;
  const displayPubkeys = typingPubkeys.slice(0, maxVisible);
  const displayLabels = labels.slice(0, maxVisible);

  return (
    <div
      aria-live="polite"
      className={cn(
        "shrink-0 bg-transparent",
        isActivityVariant ? "flex items-center px-0 py-0" : "px-4 py-2 sm:px-6",
        className,
      )}
      {...(labels.length > 0
        ? { "data-testid": "message-typing-indicator" }
        : {})}
    >
      {labels.length > 0 && (
        <div
          className={cn(
            "flex min-w-0 w-full items-center",
            isActivityVariant ? "h-full gap-1.5" : "gap-2",
          )}
        >
          <div className="flex shrink-0 items-center">
            {displayPubkeys.map((pubkey, index) => {
              const profile = profiles?.[pubkey.toLowerCase()];
              const label = displayLabels[index] ?? truncatePubkey(pubkey);
              return (
                <TyperAvatar
                  key={pubkey}
                  pubkey={pubkey}
                  profile={profile}
                  label={label}
                  isActivityVariant={isActivityVariant}
                />
              );
            })}
          </div>
          <p
            className={cn(
              "min-w-0 translate-y-px truncate text-muted-foreground",
              isActivityVariant
                ? "text-2xs font-medium leading-3"
                : "text-xs font-medium leading-4",
            )}
            data-testid="message-typing-indicator-label"
          >
            <Shimmer>{formatTypingLabel(displayLabels)}</Shimmer>
          </p>
        </div>
      )}
    </div>
  );
}
