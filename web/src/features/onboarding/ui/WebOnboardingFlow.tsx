import { useState } from "react";
import { IdentityStep } from "./IdentityStep";
import { KeyImportStep } from "./KeyImportStep";
import { ProfileSetupStep } from "./ProfileSetupStep";
import { WebBackupStep } from "./WebBackupStep";
import { WebInviteRedeemStep } from "./WebInviteRedeemStep";
import { getPendingInvite } from "../lib/pendingInvite";

type Step = "identity" | "key-import" | "avatar" | "backup" | "invite";

interface Props {
  onComplete: () => void;
}

export function WebOnboardingFlow({ onComplete }: Props) {
  const [step, setStep] = useState<Step>("identity");

  const afterBackup = () => {
    if (getPendingInvite()) {
      setStep("invite");
    } else {
      onComplete();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-lg">
        {step === "identity" && (
          <IdentityStep
            onComplete={() => setStep("avatar")}
            onImportKey={() => setStep("key-import")}
          />
        )}
        {step === "key-import" && (
          <KeyImportStep
            onComplete={() => setStep("avatar")}
            onSkip={() => setStep("identity")}
          />
        )}
        {step === "avatar" && (
          <ProfileSetupStep onComplete={() => setStep("backup")} />
        )}
        {step === "backup" && (
          <WebBackupStep onComplete={afterBackup} onSkip={afterBackup} />
        )}
        {step === "invite" && (
          <WebInviteRedeemStep onComplete={onComplete} onSkip={onComplete} />
        )}
      </div>
    </div>
  );
}
