import { useState } from "react";
import { Ticket } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

const KIND_INVITE_REDEEM = 9021;

interface Props {
  communityId: string;
  onSuccess: () => void;
  initialCode?: string;
}

export function InviteRedeemForm({
  communityId,
  onSuccess,
  initialCode = "",
}: Props) {
  const [code, setCode] = useState(initialCode);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const redeem = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError("");
    try {
      const signed = await signNostrEvent(
        {
          kind: KIND_INVITE_REDEEM,
          content: trimmed,
          tags: [["h", communityId]],
        },
        { requireNip07: false },
      );
      await getRelayClient(relayWsUrl()).publishAndWait(
        signed as Record<string, unknown>,
      );
      onSuccess();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to redeem invite code.",
      );
    }
    setSubmitting(false);
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/5">
        <Ticket className="h-7 w-7 text-black/50 dark:text-white/50" />
      </div>

      <div className="text-center">
        <h2 className="text-xl font-semibold text-black dark:text-white">
          Redeem Invite
        </h2>
        <p className="mt-2 text-sm text-black/50 dark:text-white/50">
          Enter your invite code to join this workspace.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Paste invite code"
          className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2.5 font-mono text-sm text-black outline-none focus:border-black/30 dark:border-white/15 dark:text-white dark:focus:border-white/30"
        />

        {error && <p className="text-xs text-red-500">{error}</p>}

        <Button
          className="w-full"
          onClick={() => void redeem()}
          disabled={submitting || !code.trim()}
        >
          {submitting ? "Redeeming…" : "Redeem Invite"}
        </Button>
      </div>
    </div>
  );
}
