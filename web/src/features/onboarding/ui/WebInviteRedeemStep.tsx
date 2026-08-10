import { Ticket } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useCommunityId } from "@/shared/lib/workspace-context";
import { getPendingInvite, clearPendingInvite } from "../lib/pendingInvite";
import { InviteRedeemForm } from "./InviteRedeemForm";

interface Props {
  onComplete: () => void;
  onSkip: () => void;
}

export function WebInviteRedeemStep({ onComplete, onSkip }: Props) {
  const communityId = useCommunityId();
  const pending = getPendingInvite();

  const handleSuccess = () => {
    clearPendingInvite();
    onComplete();
  };

  if (!communityId) return null;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/5">
        <Ticket className="h-7 w-7 text-black/50 dark:text-white/50" />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-semibold text-black dark:text-white">
          Redeem your invite
        </h2>
        <p className="mt-2 text-sm text-black/50 dark:text-white/50">
          Enter your invite code to join this community.
        </p>
      </div>
      <div className="w-full max-w-sm">
        <InviteRedeemForm
          communityId={communityId}
          onSuccess={handleSuccess}
          initialCode={pending?.code ?? ""}
        />
      </div>
      <Button
        variant="ghost"
        className="text-sm text-black/40 dark:text-white/40"
        onClick={onSkip}
        type="button"
      >
        Skip
      </Button>
    </div>
  );
}
