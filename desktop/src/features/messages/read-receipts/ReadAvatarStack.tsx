import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import { useUserProfileQuery } from "@/features/profile/hooks";
import type { ReadReceipt } from "./types";

interface Props {
  receipts: ReadReceipt[];
  maxVisible?: number;
}

function AvatarPip({ pubkey }: { pubkey: string }) {
  const { data: profile } = useUserProfileQuery(pubkey);
  const name = profile?.displayName ?? pubkey.slice(0, 8);
  return (
    <Avatar className="w-5 h-5 -ml-1 first:ml-0 border border-background">
      <AvatarImage src={profile?.avatarUrl ?? undefined} alt={name ?? ""} />
      <AvatarFallback className="text-[9px]">
        {name?.[0]?.toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

export function ReadAvatarStack({ receipts, maxVisible = 3 }: Props) {
  if (receipts.length === 0) return null;
  const visible = receipts.slice(0, maxVisible);
  const overflow = receipts.length - visible.length;
  return (
    <div className="flex items-center">
      {visible.map((r) => (
        <AvatarPip key={r.pubkey} pubkey={r.pubkey} />
      ))}
      {overflow > 0 && (
        <div className="w-5 h-5 rounded-full border border-background bg-muted -ml-1 flex items-center justify-center text-[9px] font-medium">
          +{overflow}
        </div>
      )}
    </div>
  );
}
