import { useState } from "react";
import { nip19 } from "nostr-tools";
import { Copy, Check, MessageSquare, X, UserPlus } from "lucide-react";
import { useProfile } from "@/features/profiles/use-profile";
import { useUserStatus } from "@/features/profile/useUserStatus";
import { Avatar } from "@/shared/ui/Avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/ui/tabs";
import { Separator } from "@/shared/ui/separator";
import { Button } from "@/shared/ui/button";

interface Props {
  pubkey: string;
  open: boolean;
  onClose: () => void;
  onSendDm?: (pubkey: string) => void;
  isSelf?: boolean;
}

export function UserProfilePanel({
  pubkey,
  open,
  onClose,
  onSendDm,
  isSelf,
}: Props) {
  const profile = useProfile(pubkey);
  const status = useUserStatus(pubkey);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState("about");

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
    <div className="flex h-full w-80 flex-col border-l border-black/10 bg-white dark:border-white/10 dark:bg-[#1a1a1a]">
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="text-sm font-semibold text-black dark:text-white">
          Profile
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col items-center px-4 py-6">
        <Avatar src={profile?.picture} name={displayName} size={72} online />
        <h2 className="mt-3 text-lg font-semibold text-black dark:text-white">
          {displayName}
        </h2>
        {status && (
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            {status.emoji} {status.text}
          </p>
        )}
        <button
          type="button"
          onClick={copyPubkey}
          className="mt-2 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
        >
          {copied ? (
            <Check className="h-3 w-3" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          {copied ? "Copied" : `${npub.slice(0, 12)}…${npub.slice(-4)}`}
        </button>
      </div>

      {!isSelf && (
        <div className="flex gap-2 px-4 pb-4">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onSendDm?.(pubkey)}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Message
          </Button>
          <Button variant="ghost" size="sm">
            <UserPlus className="h-3.5 w-3.5" />
            Follow
          </Button>
        </div>
      )}

      <Separator />

      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex-1 overflow-hidden px-4 pt-3"
      >
        <TabsList>
          <TabsTrigger value="about">About</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="about" className="overflow-auto">
          {profile?.about ? (
            <p className="text-sm text-black/70 dark:text-white/70 whitespace-pre-wrap">
              {profile.about}
            </p>
          ) : (
            <p className="text-sm text-black/30 dark:text-white/30">
              No bio set
            </p>
          )}
        </TabsContent>

        <TabsContent value="activity" className="overflow-auto">
          <p className="text-sm text-black/30 dark:text-white/30">
            Activity feed coming soon
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
